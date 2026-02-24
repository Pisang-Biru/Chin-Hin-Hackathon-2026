import { createFileRoute } from '@tanstack/react-router'

import { runDeterministicRoutingForLead } from '@/lib/routing/run-deterministic-routing'
import type { RoutingLiveEvent } from '@/lib/routing/run-deterministic-routing'
import { requireRoles } from '@/lib/server/auth-guard'
import { sanitizeErrorMessage } from '@/lib/server/json-response'

type LiveRoutingEvent =
  | RoutingLiveEvent
  | {
      type: 'PREVIEW_OPENED'
      leadId: string
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

function formatSseData(payload: LiveRoutingEvent): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export const Route = createFileRoute('/api/leads/$leadId/reroute-live')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const authz = await requireRoles(request, ['admin', 'synergy'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const leadId = params.leadId
        const encoder = new TextEncoder()

        const stream = new ReadableStream({
          start(controller) {
            let isClosed = false

            const send = (payload: LiveRoutingEvent) => {
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
              try {
                const summary = await runDeterministicRoutingForLead({
                  leadId,
                  triggeredBy: principal.userId,
                  previewDelayMs: 260,
                  onEvent: (event) => {
                    send(event)
                  },
                })

                send({
                  type: 'PREVIEW_SUMMARY',
                  leadId,
                  routingRunId: summary.routingRunId,
                  recommendationsCount: summary.recommendationsCount,
                  assignmentCount: summary.assignmentCount,
                  scoredBusinessUnits: summary.scoredBusinessUnits,
                  timestamp: new Date().toISOString(),
                })
              } catch (error) {
                send({
                  type: 'ROUTING_FAILED',
                  leadId,
                  routingRunId: 'unknown',
                  error: sanitizeErrorMessage(error),
                  timestamp: new Date().toISOString(),
                })
              } finally {
                close()
              }
            })()
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
