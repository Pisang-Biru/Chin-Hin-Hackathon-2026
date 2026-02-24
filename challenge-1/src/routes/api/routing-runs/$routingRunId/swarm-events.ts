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
  | {
      type: 'HEARTBEAT'
      timestamp: string
      stage: string
    }
  | {
      type: 'DELEGATION_APPROVAL_REQUIRED'
      leadId: string
      routingRunId: string
      sessionId: string
      stepId: string
      stepIndex: number
      subagentName: string
      timestamp: string
    }
  | {
      type: 'SESSION_PENDING'
      leadId: string
      routingRunId: string
      sessionId: string
      reason: string
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

        const pendingSessionRows = await prisma.$queryRaw<
          Array<{
            sessionId: string
            sessionStatus: string
            pendingStepId: string | null
            lastError: string | null
            stepIndex: number | null
            subagentName: string | null
          }>
        >`
          SELECT
            session."id" AS "sessionId",
            session."status"::text AS "sessionStatus",
            session."pendingStepId" AS "pendingStepId",
            session."lastError" AS "lastError",
            step."stepIndex" AS "stepIndex",
            step."subagentName" AS "subagentName"
          FROM "AgentSession" session
          LEFT JOIN "AgentDelegationStep" step ON step."id" = session."pendingStepId"
          WHERE session."routingRunId" = ${routingRunId}
          LIMIT 1
        `
        const pendingSession = pendingSessionRows[0] ?? null

        const stream = new ReadableStream({
          start(controller) {
            let isClosed = false
            let heartbeatTimer: ReturnType<typeof setInterval> | null = null

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
              if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
                heartbeatTimer = null
              }
              controller.close()
            }

            send({
              type: 'PREVIEW_OPENED',
              leadId,
              timestamp: new Date().toISOString(),
            })
            heartbeatTimer = setInterval(() => {
              send({
                type: 'HEARTBEAT',
                timestamp: new Date().toISOString(),
                stage: 'replay',
              })
            }, 1_200)

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

              if (
                pendingSession &&
                pendingSession.sessionStatus === 'PENDING_APPROVAL' &&
                pendingSession.pendingStepId
              ) {
                send({
                  type: 'DELEGATION_APPROVAL_REQUIRED',
                  leadId,
                  routingRunId,
                  sessionId: pendingSession.sessionId,
                  stepId: pendingSession.pendingStepId,
                  stepIndex: pendingSession.stepIndex ?? 0,
                  subagentName: pendingSession.subagentName || 'unknown_subagent',
                  timestamp: new Date().toISOString(),
                })
                await sleep(180)

                send({
                  type: 'SESSION_PENDING',
                  leadId,
                  routingRunId,
                  sessionId: pendingSession.sessionId,
                  reason:
                    pendingSession.lastError ||
                    'Awaiting Synergy delegation approval before completion.',
                  timestamp: new Date().toISOString(),
                })
                await sleep(180)
              }

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
                    in: ['PENDING_SYNERGY', 'APPROVED', 'DISPATCHED'],
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
