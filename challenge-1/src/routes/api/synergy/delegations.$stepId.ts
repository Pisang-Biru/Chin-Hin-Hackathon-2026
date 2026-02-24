import { createFileRoute } from '@tanstack/react-router'

import { handleDeepAgentDelegationDecision } from '@/lib/swarm/deep-agents-routing'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse, sanitizeErrorMessage } from '@/lib/server/json-response'

type DecisionStatus = 'APPROVED' | 'REJECTED'

function validateDecisionPayload(payload: unknown): {
  status?: DecisionStatus
  reason?: string
  error?: string
} {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid payload.' }
  }

  const status = (payload as { status?: unknown }).status
  if (status !== 'APPROVED' && status !== 'REJECTED') {
    return { error: 'Status must be APPROVED or REJECTED.' }
  }

  const reasonRaw = (payload as { reason?: unknown }).reason
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : ''

  if (status === 'REJECTED' && reason.length < 5) {
    return { error: 'Reason is required when rejecting (minimum 5 characters).' }
  }

  return {
    status,
    reason,
  }
}

export const Route = createFileRoute('/api/synergy/delegations/$stepId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const authz = await requireRoles(request, ['admin', 'synergy'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const payload = await request.json().catch(() => null)
        const validated = validateDecisionPayload(payload)
        if (!validated.status) {
          return jsonResponse({ error: validated.error || 'Invalid payload.' }, 400)
        }

        try {
          const result = await handleDeepAgentDelegationDecision({
            stepId: params.stepId,
            status: validated.status,
            actedBy: principal.userId,
            reason: validated.reason,
          })

          console.info('[synergy.delegations.update-status]', {
            userId: principal.userId,
            role: principal.role,
            stepId: params.stepId,
            status: validated.status,
            sessionId: result.sessionId,
            routingRunId: result.routingRunId,
            sessionStatus: result.sessionStatus,
          })

          return jsonResponse({ result })
        } catch (error) {
          return jsonResponse(
            {
              error: 'Failed to update delegation status.',
              details: sanitizeErrorMessage(error),
            },
            500,
          )
        }
      },
    },
  },
})
