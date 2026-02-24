import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '@/db'
import { getAnalyzeResult } from '@/lib/azure/docintel'
import { extractLeadMetadata } from '@/lib/leads/lead-metadata'
import {
  ROUTING_CORE_FACT_KEYS,
  normalizeToLeadFacts,
} from '@/lib/leads/normalize-extraction'
import { runDeterministicRoutingForLead } from '@/lib/routing/run-deterministic-routing'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse, sanitizeErrorMessage } from '@/lib/server/json-response'

function serializeAzureError(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }

    return JSON.stringify(error)
  }

  return 'Unknown extraction error'
}

async function getNormalizedFactsCount(leadId: string | null): Promise<number> {
  if (!leadId) {
    return 0
  }

  return prisma.leadFact.count({
    where: {
      leadId,
      factKey: {
        in: [...ROUTING_CORE_FACT_KEYS],
      },
    },
  })
}

export const Route = createFileRoute('/api/leads/documents/$documentId/status')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const authz = await requireRoles(request, ['admin', 'synergy'])
        if (authz.response) {
          return authz.response
        }

        const liveRoutingMode = new URL(request.url).searchParams.get('liveRouting') === '1'

        const documentId = params.documentId
        const document = await prisma.leadDocument.findUnique({
          where: { id: documentId },
          include: {
            leads: {
              take: 1,
              select: {
                id: true,
                projectName: true,
                locationText: true,
              },
            },
          },
        })

        if (!document) {
          return jsonResponse({ error: 'Document not found' }, 404)
        }

        const leadId = document.leads[0]?.id ?? null

        if (document.parseStatus !== 'ANALYZING') {
          const normalizedFactsCount = await getNormalizedFactsCount(leadId)
          return jsonResponse({
            documentId,
            leadId,
            parseStatus: document.parseStatus,
            progress:
              document.parseStatus === 'NORMALIZED' || document.parseStatus === 'EXTRACTED'
                ? 'complete'
                : 'idle',
            normalizedFactsCount,
            errors: document.lastError ? [document.lastError] : undefined,
          })
        }

        if (!document.analysisOperationLocation) {
          await prisma.leadDocument.update({
            where: { id: documentId },
            data: {
              parseStatus: 'FAILED',
              lastError: 'Missing operation location for analyzing document.',
              analysisCompletedAt: new Date(),
            },
          })

          return jsonResponse({
            documentId,
            leadId,
            parseStatus: 'FAILED',
            progress: 'failed',
            errors: ['Missing operation location for analyzing document.'],
          })
        }

        const analyze = await getAnalyzeResult(document.analysisOperationLocation)

        if (analyze.status === 'running' || analyze.status === 'notStarted') {
          return jsonResponse({
            documentId,
            leadId,
            parseStatus: 'ANALYZING',
            progress: analyze.status,
            normalizedFactsCount: await getNormalizedFactsCount(leadId),
          })
        }

        if (analyze.status === 'succeeded') {
          const facts = normalizeToLeadFacts(analyze.raw)
          const extractedMetadata = extractLeadMetadata({
            rawExtraction: analyze.raw,
            fileName: document.fileName,
            facts,
          })
          const nextStatus = facts.length > 0 ? 'NORMALIZED' : 'EXTRACTED'

          await prisma.$transaction(async (tx) => {
            await tx.leadDocument.update({
              where: { id: documentId },
              data: {
                parseStatus: nextStatus,
                rawExtraction: analyze.raw as object,
                analysisCompletedAt: new Date(),
                lastError: null,
              },
            })

            if (leadId) {
              await tx.lead.update({
                where: { id: leadId },
                data: {
                  currentStatus: nextStatus.toLowerCase(),
                  projectName:
                    document.leads[0]?.projectName?.trim() || extractedMetadata.projectName,
                  locationText:
                    document.leads[0]?.locationText?.trim() || extractedMetadata.locationText,
                },
              })

              await tx.leadFact.deleteMany({
                where: {
                  leadId,
                  factKey: {
                    in: [...ROUTING_CORE_FACT_KEYS],
                  },
                },
              })

              if (facts.length > 0) {
                await tx.leadFact.createMany({
                  data: facts.map((fact) => ({
                    leadId,
                    sourceDocumentId: documentId,
                    factKey: fact.factKey,
                    factValue: fact.factValue,
                    confidence: fact.confidence,
                  })),
                  skipDuplicates: true,
                })
              }
            }
          })

          let routing:
            | {
                status: 'COMPLETED'
                routingRunId: string
                recommendationsCount: number
                assignmentCount: number
              }
            | {
                status: 'SKIPPED'
                reason: string
              }
            | {
                status: 'FAILED'
                error: string
              }
            | undefined

          if (nextStatus === 'NORMALIZED' && leadId) {
            if (liveRoutingMode) {
              routing = {
                status: 'SKIPPED',
                reason: 'Live routing pending.',
              }

              return jsonResponse({
                documentId,
                leadId,
                parseStatus: nextStatus,
                progress: 'succeeded',
                normalizedFactsCount: facts.length,
                routing,
              })
            }

            try {
              const routingSummary = await runDeterministicRoutingForLead({
                leadId,
                triggeredBy: 'system:auto',
              })
              routing = {
                status: 'COMPLETED',
                routingRunId: routingSummary.routingRunId,
                recommendationsCount: routingSummary.recommendationsCount,
                assignmentCount: routingSummary.assignmentCount,
              }
            } catch (routingError) {
              const error = sanitizeErrorMessage(routingError)
              routing = {
                status: 'FAILED',
                error,
              }
              await prisma.lead.update({
                where: { id: leadId },
                data: {
                  currentStatus: 'routing_failed',
                },
              })
              console.error('[leads.documents.status.routing.failed]', {
                documentId,
                leadId,
                error,
              })
            }
          } else {
            routing = {
              status: 'SKIPPED',
              reason:
                !leadId
                  ? 'Missing lead relation for document.'
                  : 'No normalized routing-core facts.',
            }
          }

          return jsonResponse({
            documentId,
            leadId,
            parseStatus: nextStatus,
            progress: 'succeeded',
            normalizedFactsCount: facts.length,
            routing,
          })
        }

        const message = serializeAzureError(analyze.error)

        await prisma.$transaction(async (tx) => {
          await tx.leadDocument.update({
            where: { id: documentId },
            data: {
              parseStatus: 'FAILED',
              lastError: message,
              analysisCompletedAt: new Date(),
            },
          })

          if (leadId) {
            await tx.lead.update({
              where: { id: leadId },
              data: {
                currentStatus: 'failed',
              },
            })
          }
        })

        return jsonResponse({
          documentId,
          leadId,
          parseStatus: 'FAILED',
          progress: 'failed',
          errors: [message],
        })
      },
    },
  },
})
