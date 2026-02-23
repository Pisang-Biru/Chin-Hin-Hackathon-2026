import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '@/db'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse } from '@/lib/server/json-response'

type AssignmentFilterStatus = 'APPROVED' | 'DISPATCHED' | 'CANCELED' | 'ALL'

function parseStatus(value: string | null): AssignmentFilterStatus | null {
  if (!value) {
    return 'APPROVED'
  }

  const normalized = value.toUpperCase()
  if (
    normalized === 'APPROVED' ||
    normalized === 'DISPATCHED' ||
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
              },
            },
            routingRecommendation: {
              select: {
                id: true,
                role: true,
                finalScore: true,
                confidence: true,
                reasonSummary: true,
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
          assignments: assignments.map((assignment) => ({
            id: assignment.id,
            status: assignment.status,
            assignedRole: assignment.assignedRole,
            approvedBy: assignment.approvedBy,
            approvedAt: assignment.approvedAt,
            dispatchedAt: assignment.dispatchedAt,
            businessUnit: assignment.businessUnit,
            lead: assignment.lead,
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
            artifacts: assignment.artifacts.map((artifact) => ({
              id: artifact.id,
              artifactType: artifact.artifactType,
              createdAt: artifact.createdAt,
              downloadUrl: `/api/assignments/${assignment.id}/artifacts/${artifact.artifactType.toLowerCase()}`,
            })),
          })),
        })
      },
    },
  },
})
