import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '@/db'
import { updateAssignmentWithDispatchWorkflow } from '@/lib/assignments/dispatch-workflow'
import { validateSynergyDecisionPayload } from '@/lib/bu/assignment-status-validation'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse, sanitizeErrorMessage } from '@/lib/server/json-response'

export const Route = createFileRoute('/api/synergy/approvals/$assignmentId/status')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const authz = await requireRoles(request, ['admin', 'synergy'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const payload = await request.json().catch(() => null)
        const validated = validateSynergyDecisionPayload(payload)
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

        if (assignment.status !== 'PENDING_SYNERGY') {
          return jsonResponse(
            {
              error:
                'Only assignments pending Synergy approval can be actioned from this endpoint.',
            },
            409,
          )
        }

        try {
          const result = await updateAssignmentWithDispatchWorkflow({
            assignmentId: assignment.id,
            status: validated.status,
            actedBy: principal.userId,
            reason: validated.reason,
          })

          console.info('[synergy.approvals.update-status]', {
            userId: principal.userId,
            role: principal.role,
            assignmentId: assignment.id,
            businessUnitId: assignment.businessUnitId,
            previousStatus: assignment.status,
            status: validated.status,
            reason: validated.reason || null,
            generatedArtifactCount: result.generatedArtifacts.length,
          })

          return jsonResponse({
            assignment: result.assignment,
            generatedArtifacts: result.generatedArtifacts.map((artifact) => ({
              id: artifact.id,
              artifactType: artifact.artifactType,
              createdAt: artifact.createdAt,
              downloadUrl: `/api/assignments/${result.assignment.id}/artifacts/${artifact.artifactType.toLowerCase()}`,
            })),
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
