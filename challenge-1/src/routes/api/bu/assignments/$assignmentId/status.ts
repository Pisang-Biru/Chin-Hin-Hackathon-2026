import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '@/db'
import { validateAssignmentStatusPayload } from '@/lib/bu/assignment-status-validation'
import { canAccessBusinessUnit, requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse, sanitizeErrorMessage } from '@/lib/server/json-response'

export const Route = createFileRoute('/api/bu/assignments/$assignmentId/status')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const authz = await requireRoles(request, ['admin', 'synergy', 'bu_user'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const payload = await request.json().catch(() => null)
        const validated = validateAssignmentStatusPayload(payload)
        if (!validated.status) {
          return jsonResponse({ error: validated.error || 'Invalid payload.' }, 400)
        }

        const assignment = await prisma.assignment.findUnique({
          where: { id: params.assignmentId },
          select: {
            id: true,
            businessUnitId: true,
            status: true,
          },
        })

        if (!assignment) {
          return jsonResponse({ error: 'Assignment not found.' }, 404)
        }

        if (!canAccessBusinessUnit(principal, assignment.businessUnitId)) {
          return jsonResponse({ error: 'Forbidden' }, 403)
        }

        try {
          const updated = await prisma.assignment.update({
            where: { id: assignment.id },
            data: {
              status: validated.status,
              dispatchedAt: validated.status === 'DISPATCHED' ? new Date() : null,
            },
            include: {
              businessUnit: {
                select: { id: true, code: true, name: true },
              },
              lead: {
                select: { id: true, projectName: true, locationText: true },
              },
            },
          })

          console.info('[bu.assignments.update-status]', {
            userId: principal.userId,
            role: principal.role,
            assignmentId: assignment.id,
            businessUnitId: assignment.businessUnitId,
            status: validated.status,
          })

          return jsonResponse({
            assignment: {
              id: updated.id,
              status: updated.status,
              assignedRole: updated.assignedRole,
              approvedAt: updated.approvedAt,
              dispatchedAt: updated.dispatchedAt,
              businessUnit: updated.businessUnit,
              lead: updated.lead,
            },
          })
        } catch (error) {
          return jsonResponse(
            {
              error: 'Failed to update assignment status.',
              details: sanitizeErrorMessage(error),
            },
            500,
          )
        }
      },
    },
  },
})
