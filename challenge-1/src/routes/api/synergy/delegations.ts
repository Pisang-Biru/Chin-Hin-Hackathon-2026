import { createFileRoute } from '@tanstack/react-router'

import { listDeepAgentDelegations } from '@/lib/swarm/deep-agents-routing'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse, sanitizeErrorMessage } from '@/lib/server/json-response'

type DelegationStatusFilter = 'PENDING' | 'ALL'

function parseStatusFilter(value: string | null): DelegationStatusFilter | null {
  if (!value) {
    return 'PENDING'
  }

  const normalized = value.toUpperCase()
  if (normalized === 'PENDING' || normalized === 'ALL') {
    return normalized
  }

  return null
}

export const Route = createFileRoute('/api/synergy/delegations')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authz = await requireRoles(request, ['admin', 'synergy'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const statusFilter = parseStatusFilter(
          new URL(request.url).searchParams.get('status'),
        )
        if (!statusFilter) {
          return jsonResponse({ error: 'Invalid status filter.' }, 400)
        }

        try {
          const delegations = await listDeepAgentDelegations(statusFilter)

          console.info('[synergy.delegations.list]', {
            userId: principal.userId,
            role: principal.role,
            statusFilter,
            count: delegations.length,
          })

          return jsonResponse({
            statusFilter,
            delegations,
          })
        } catch (error) {
          return jsonResponse(
            {
              error: 'Failed to load deep agent delegations.',
              details: sanitizeErrorMessage(error),
            },
            500,
          )
        }
      },
    },
  },
})
