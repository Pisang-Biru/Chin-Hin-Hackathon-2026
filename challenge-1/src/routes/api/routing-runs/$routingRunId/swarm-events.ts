import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '@/db'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse } from '@/lib/server/json-response'

type SwarmReplayEvent =
  | {
      type: 'PREVIEW_OPENED'
      leadId: string
      timestamp: string
    }
  | {
      type: 'ROUTING_STARTED'
      leadId: string
      triggeredBy: string
      routingRunId: string
      leadFactsCount: number
      activeRuleSetsCount: number
      timestamp: string
    }
  | {
      type: 'RECOMMENDATION_SELECTED'
      leadId: string
      routingRunId: string
      businessUnitId: string
      businessUnitCode: string
      businessUnitName: string
      role: string
      finalScore: number
      confidence: number
      reasonSummary: string
      timestamp: string
    }
  | {
      type: 'AGENT_TYPING'
      leadId: string
      routingRunId: string
      businessUnitCode: string
      agentId: string
      recipientId: string | null
      messageType: string
      timestamp: string
    }
  | {
      type: 'AGENT_MESSAGE'
      leadId: string
      routingRunId: string
      businessUnitCode: string
      agentId: string
      recipientId: string | null
      messageType: string
      content: string
      timestamp: string
    }
  | {
      type: 'SKU_PROPOSALS'
      leadId: string
      routingRunId: string
      businessUnitCode: string
      proposals: Array<{
        buSkuId: string
        rank: number
        confidence: number
        rationale: string
      }>
      timestamp: string
    }
  | {
      type: 'ROUTING_COMPLETED'
      leadId: string
      routingRunId: string
      recommendationsCount: number
      assignmentCount: number
      scoredBusinessUnits: number
      timestamp: string
    }
  | {
      type: 'PREVIEW_SUMMARY'
      leadId: string
      routingRunId: string
      recommendationsCount: number
      assignmentCount: number
      scoredBusinessUnits: number
      timestamp: string
    }

function formatSseData(payload: SwarmReplayEvent): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function sleep(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toBuAgentId(businessUnitCode: string): string {
  return `${businessUnitCode.toLowerCase()}_agent`
}

export const Route = createFileRoute('/api/routing-runs/$routingRunId/swarm-events')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const authz = await requireRoles(request, ['admin', 'synergy'])
        if (authz.response) {
          return authz.response
        }

        const run = await prisma.routingRun.findUnique({
          where: { id: params.routingRunId },
          include: {
            lead: {
              select: {
                id: true,
                facts: {
                  select: { id: true },
                },
              },
            },
            recommendations: {
              orderBy: [{ finalScore: 'desc' }],
              include: {
                businessUnit: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
                recommendationSkus: {
                  orderBy: { rank: 'asc' },
                  select: {
                    buSkuId: true,
                    rank: true,
                    confidence: true,
                    rationale: true,
                  },
                },
              },
            },
            agentLogs: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                agentId: true,
                recipientId: true,
                messageType: true,
                content: true,
                createdAt: true,
              },
            },
          },
        })

        if (!run) {
          return jsonResponse({ error: 'Routing run not found.' }, 404)
        }

        const leadId = run.lead.id
        const routingRunId = run.id
        const encoder = new TextEncoder()

        const stream = new ReadableStream({
          start(controller) {
            let isClosed = false

            const send = (payload: SwarmReplayEvent) => {
              if (isClosed) {
                return
              }
              controller.enqueue(encoder.encode(formatSseData(payload)))
            }

            const close = () => {
              if (isClosed) {
                return
              }
              isClosed = true
              controller.close()
            }

            send({
              type: 'PREVIEW_OPENED',
              leadId,
              timestamp: new Date().toISOString(),
            })

            void (async () => {
              send({
                type: 'ROUTING_STARTED',
                leadId,
                triggeredBy: 'system:stored-replay',
                routingRunId,
                leadFactsCount: run.lead.facts.length,
                activeRuleSetsCount: run.recommendations.length,
                timestamp: run.startedAt.toISOString(),
              })

              for (const recommendation of run.recommendations) {
                const buCode = recommendation.businessUnit.code
                const buAgentId = toBuAgentId(buCode)

                send({
                  type: 'RECOMMENDATION_SELECTED',
                  leadId,
                  routingRunId,
                  businessUnitId: recommendation.businessUnit.id,
                  businessUnitCode: buCode,
                  businessUnitName: recommendation.businessUnit.name,
                  role: recommendation.role,
                  finalScore: Number(recommendation.finalScore.toString()),
                  confidence: Number(recommendation.confidence.toString()),
                  reasonSummary: recommendation.reasonSummary,
                  timestamp: recommendation.createdAt.toISOString(),
                })
                await sleep(180)

                const buConversationLogs = run.agentLogs.filter(
                  (log) => log.agentId === buAgentId || log.recipientId === buAgentId,
                )

                for (const log of buConversationLogs) {
                  send({
                    type: 'AGENT_TYPING',
                    leadId,
                    routingRunId,
                    businessUnitCode: buCode,
                    agentId: log.agentId,
                    recipientId: log.recipientId,
                    messageType: log.messageType,
                    timestamp: log.createdAt.toISOString(),
                  })
                  await sleep(260)

                  send({
                    type: 'AGENT_MESSAGE',
                    leadId,
                    routingRunId,
                    businessUnitCode: buCode,
                    agentId: log.agentId,
                    recipientId: log.recipientId,
                    messageType: log.messageType,
                    content: log.content,
                    timestamp: log.createdAt.toISOString(),
                  })
                  await sleep(140)
                }

                send({
                  type: 'SKU_PROPOSALS',
                  leadId,
                  routingRunId,
                  businessUnitCode: buCode,
                  proposals: recommendation.recommendationSkus.map((proposal) => ({
                    buSkuId: proposal.buSkuId,
                    rank: proposal.rank,
                    confidence: Number(proposal.confidence.toString()),
                    rationale: proposal.rationale,
                  })),
                  timestamp: new Date().toISOString(),
                })
                await sleep(220)
              }

              const assignmentCount = await prisma.assignment.count({
                where: {
                  leadId,
                  status: {
                    in: ['APPROVED', 'DISPATCHED'],
                  },
                },
              })

              send({
                type: 'ROUTING_COMPLETED',
                leadId,
                routingRunId,
                recommendationsCount: run.recommendations.length,
                assignmentCount,
                scoredBusinessUnits: run.recommendations.length,
                timestamp: (run.finishedAt ?? new Date()).toISOString(),
              })

              send({
                type: 'PREVIEW_SUMMARY',
                leadId,
                routingRunId,
                recommendationsCount: run.recommendations.length,
                assignmentCount,
                scoredBusinessUnits: run.recommendations.length,
                timestamp: new Date().toISOString(),
              })

              close()
            })().catch(() => {
              close()
            })
          },
        })

        return new Response(stream, {
          status: 200,
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          },
        })
      },
    },
  },
})
