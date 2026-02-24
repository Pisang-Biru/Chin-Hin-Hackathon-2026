import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '@/db'
import { buildAssignmentConversation } from '@/lib/assignments/agent-conversation'
import { resolveLeadDisplay } from '@/lib/leads/lead-metadata'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse } from '@/lib/server/json-response'

type AssignmentFilterStatus =
  | 'PENDING_SYNERGY'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'BU_REJECTED'
  | 'CANCELED'
  | 'ALL'

type AssignmentDecisionMetadata = {
  synergyDecision?: {
    reason?: string | null
  }
  buDecision?: {
    reason?: string | null
  }
}

function readDecisionReason(
  requiredActions: unknown,
  key: 'synergyDecision' | 'buDecision',
): string | null {
  if (!requiredActions || typeof requiredActions !== 'object') {
    return null
  }

  const metadata = requiredActions as AssignmentDecisionMetadata
  const decision = metadata[key]
  if (!decision || typeof decision !== 'object') {
    return null
  }

  const reason = decision.reason
  return typeof reason === 'string' && reason.trim().length > 0 ? reason.trim() : null
}

function parseStatus(value: string | null): AssignmentFilterStatus | null {
  if (!value) {
    return 'PENDING_SYNERGY'
  }

  const normalized = value.toUpperCase()
  if (
    normalized === 'PENDING_SYNERGY' ||
    normalized === 'APPROVED' ||
    normalized === 'DISPATCHED' ||
    normalized === 'BU_REJECTED' ||
    normalized === 'CANCELED' ||
    normalized === 'ALL'
  ) {
    return normalized
  }

  return null
}

export const Route = createFileRoute('/api/synergy/approvals')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authz = await requireRoles(request, ['admin', 'synergy'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const searchParams = new URL(request.url).searchParams
        const status = parseStatus(searchParams.get('status'))

        if (!status) {
          return jsonResponse({ error: 'Invalid status filter.' }, 400)
        }

        const assignments = await prisma.assignment.findMany({
          where: status === 'ALL' ? undefined : { status },
          orderBy: [{ approvedAt: 'desc' }],
          include: {
            businessUnit: {
              select: { id: true, code: true, name: true },
            },
            lead: {
              select: {
                id: true,
                projectName: true,
                locationText: true,
                currentStatus: true,
                sourceDocument: {
                  select: {
                    fileName: true,
                    rawExtraction: true,
                  },
                },
                facts: {
                  where: {
                    factKey: {
                      in: ['region'],
                    },
                  },
                  select: {
                    factKey: true,
                    factValue: true,
                  },
                },
              },
            },
            routingRecommendation: {
              select: {
                id: true,
                role: true,
                finalScore: true,
                confidence: true,
                reasonSummary: true,
                routingRun: {
                  select: {
                    agentLogs: {
                      orderBy: { createdAt: 'asc' },
                      select: {
                        id: true,
                        agentId: true,
                        recipientId: true,
                        messageType: true,
                        content: true,
                        evidenceRefs: true,
                        createdAt: true,
                      },
                    },
                  },
                },
                recommendationSkus: {
                  orderBy: { rank: 'asc' },
                  select: {
                    rank: true,
                    confidence: true,
                    rationale: true,
                    buSku: {
                      select: {
                        id: true,
                        skuCode: true,
                        skuName: true,
                        skuCategory: true,
                      },
                    },
                  },
                },
              },
            },
            artifacts: {
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                artifactType: true,
                createdAt: true,
              },
            },
          },
        })

        console.info('[synergy.approvals.list]', {
          userId: principal.userId,
          role: principal.role,
          status,
          count: assignments.length,
        })

        return jsonResponse({
          statusFilter: status,
          assignments: assignments.map((assignment) => {
            const leadDisplay = resolveLeadDisplay({
              projectName: assignment.lead.projectName,
              locationText: assignment.lead.locationText,
              sourceDocument: assignment.lead.sourceDocument,
              facts: assignment.lead.facts,
            })

            return {
              id: assignment.id,
              status: assignment.status,
              assignedRole: assignment.assignedRole,
              approvedBy: assignment.approvedBy,
              approvedAt: assignment.approvedAt,
              dispatchedAt: assignment.dispatchedAt,
              synergyDecisionReason: readDecisionReason(
                assignment.requiredActions,
                'synergyDecision',
              ),
              buDecisionReason: readDecisionReason(assignment.requiredActions, 'buDecision'),
              businessUnit: assignment.businessUnit,
              lead: {
                id: assignment.lead.id,
                currentStatus: assignment.lead.currentStatus,
                projectName: leadDisplay.projectName,
                locationText: leadDisplay.locationText,
              },
              routingRecommendation: {
                id: assignment.routingRecommendation.id,
                role: assignment.routingRecommendation.role,
                finalScore: Number(assignment.routingRecommendation.finalScore.toString()),
                confidence: Number(assignment.routingRecommendation.confidence.toString()),
                reasonSummary: assignment.routingRecommendation.reasonSummary,
                skuProposals: assignment.routingRecommendation.recommendationSkus.map((item) => ({
                  rank: item.rank,
                  confidence: Number(item.confidence.toString()),
                  rationale: item.rationale,
                  buSku: item.buSku,
                })),
              },
              agentConversation: buildAssignmentConversation(
                assignment.businessUnit.code,
                assignment.routingRecommendation.routingRun.agentLogs,
              ),
              artifacts: assignment.artifacts.map((artifact) => ({
                id: artifact.id,
                artifactType: artifact.artifactType,
                createdAt: artifact.createdAt,
                downloadUrl: `/api/assignments/${assignment.id}/artifacts/${artifact.artifactType.toLowerCase()}`,
              })),
            }
          }),
        })
      },
    },
  },
})
