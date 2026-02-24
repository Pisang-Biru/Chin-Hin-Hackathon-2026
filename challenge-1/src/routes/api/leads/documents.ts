import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '@/db'
import { ROUTING_CORE_FACT_KEYS } from '@/lib/leads/normalize-extraction'
import { buildDocumentSummary } from '@/lib/leads/document-summary'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse } from '@/lib/server/json-response'

export const Route = createFileRoute('/api/leads/documents')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authz = await requireRoles(request, ['admin', 'synergy'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const documents = await prisma.leadDocument.findMany({
          orderBy: { createdAt: 'desc' },
          include: {
            leads: {
              take: 1,
              select: {
                id: true,
                currentStatus: true,
                routingRuns: {
                  take: 1,
                  orderBy: { startedAt: 'desc' },
                  select: { id: true },
                },
              },
            },
            facts: {
              where: {
                factKey: {
                  in: [...ROUTING_CORE_FACT_KEYS],
                },
              },
              select: {
                factKey: true,
                factValue: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        })

        console.info('[leads.documents.list]', {
          userId: principal.userId,
          role: principal.role,
          count: documents.length,
        })

        return jsonResponse({
          documents: documents.map((document) => {
            const hasLead = document.leads.length > 0
            const normalizedFactsCount = document.facts.length

            return {
              id: document.id,
              leadId: hasLead ? document.leads[0].id : null,
              leadStatus: hasLead ? document.leads[0].currentStatus : null,
              latestRoutingRunId:
                hasLead && document.leads[0].routingRuns.length > 0
                  ? document.leads[0].routingRuns[0].id
                  : null,
              fileName: document.fileName,
              mimeType: document.mimeType,
              fileSizeBytes: document.fileSizeBytes,
              parseStatus: document.parseStatus,
              createdAt: document.createdAt,
              updatedAt: document.updatedAt,
              analysisStartedAt: document.analysisStartedAt,
              analysisCompletedAt: document.analysisCompletedAt,
              lastError: document.lastError,
              normalizedFactsCount,
              summary: buildDocumentSummary({
                parseStatus: document.parseStatus,
                facts: document.facts,
                rawExtraction: document.rawExtraction,
              }),
            }
          }),
        })
      },
    },
  },
})
