import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '@/db'
import { buildAssignmentConversation } from '@/lib/assignments/agent-conversation'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse } from '@/lib/server/json-response'

export const Route = createFileRoute('/api/bu/assignments')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authz = await requireRoles(request, ['admin', 'synergy', 'bu_user'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const searchParams = new URL(request.url).searchParams
        const requestedBusinessUnitId = searchParams.get('businessUnitId')

        if (principal.role === 'bu_user' && !principal.primaryBusinessUnitId) {
          return jsonResponse(
            { error: 'No business unit assigned to this account.' },
            403,
          )
        }

        if (
          principal.role === 'bu_user' &&
          requestedBusinessUnitId &&
          requestedBusinessUnitId !== principal.primaryBusinessUnitId
        ) {
          return jsonResponse({ error: 'Forbidden' }, 403)
        }

        const businessUnitId =
          principal.role === 'bu_user'
            ? principal.primaryBusinessUnitId!
            : requestedBusinessUnitId

        const assignments = await prisma.assignment.findMany({
          where: businessUnitId ? { businessUnitId } : undefined,
          orderBy: { approvedAt: 'desc' },
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
              },
            },
            artifacts: {
              select: {
                id: true,
                artifactType: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        })

        const availableBusinessUnits =
          principal.role === 'admin' || principal.role === 'synergy'
            ? await prisma.businessUnit.findMany({
                where: { isActive: true },
                orderBy: { name: 'asc' },
                select: { id: true, code: true, name: true },
              })
            : []

        console.info('[bu.assignments.list]', {
          userId: principal.userId,
          role: principal.role,
          businessUnitId: businessUnitId ?? null,
          count: assignments.length,
        })

        return jsonResponse({
          role: principal.role,
          primaryBusinessUnitId: principal.primaryBusinessUnitId,
          assignments: assignments.map((assignment) => ({
            id: assignment.id,
            status: assignment.status,
            assignedRole: assignment.assignedRole,
            approvedAt: assignment.approvedAt,
            dispatchedAt: assignment.dispatchedAt,
            businessUnit: assignment.businessUnit,
            lead: assignment.lead,
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
          })),
          availableBusinessUnits,
        })
      },
    },
  },
})
