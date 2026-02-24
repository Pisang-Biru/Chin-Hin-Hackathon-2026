import { createFileRoute } from '@tanstack/react-router'

import { runRoutingForLead } from '@/lib/routing/run-routing-for-lead'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse, sanitizeErrorMessage } from '@/lib/server/json-response'

export const Route = createFileRoute('/api/leads/$leadId/reroute')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const authz = await requireRoles(request, ['admin', 'synergy'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        try {
          const summary = await runRoutingForLead({
            leadId: params.leadId,
            triggeredBy: principal.userId,
          })

          return jsonResponse(
            {
              routingRunId: summary.routingRunId,
              leadId: summary.leadId,
              engineVersion: summary.engineVersion,
              scoredBusinessUnits: summary.scoredBusinessUnits,
              recommendationsCount: summary.recommendationsCount,
              assignmentCount: summary.assignmentCount,
              scores: summary.scores,
              status: summary.status,
            },
            202,
          )
        } catch (error) {
          return jsonResponse(
            {
              error: 'Failed to run deterministic routing.',
              details: sanitizeErrorMessage(error),
            },
            500,
          )
        }
      },
    },
  },
})
