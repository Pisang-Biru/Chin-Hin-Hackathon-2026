import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '@/db'
import { startAnalyzeFromStream } from '@/lib/azure/docintel'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse, sanitizeErrorMessage } from '@/lib/server/json-response'
import { downloadLeadDocument } from '@/lib/storage/blob'

export const Route = createFileRoute('/api/leads/documents/$documentId/retry')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const authz = await requireRoles(request, ['admin', 'synergy'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const document = await prisma.leadDocument.findUnique({
          where: { id: params.documentId },
          include: {
            leads: {
              take: 1,
              select: { id: true },
            },
          },
        })

        if (!document) {
          return jsonResponse({ error: 'Document not found' }, 404)
        }

        if (document.parseStatus !== 'FAILED') {
          return jsonResponse(
            {
              error: 'Retry is only allowed for failed documents.',
              parseStatus: document.parseStatus,
            },
            409,
          )
        }

        try {
          const bytes = await downloadLeadDocument(document.storagePath)
          const operation = await startAnalyzeFromStream({
            mimeType: document.mimeType,
            bytes,
            model: document.analysisModel || undefined,
          })

          await prisma.$transaction(async (tx) => {
            await tx.leadDocument.update({
              where: { id: document.id },
              data: {
                parseStatus: 'ANALYZING',
                analysisOperationId: operation.operationId,
                analysisOperationLocation: operation.operationLocation,
                analysisStartedAt: new Date(),
                analysisCompletedAt: null,
                lastError: null,
              },
            })

            const leadId = document.leads[0]?.id
            if (leadId) {
              await tx.lead.update({
                where: { id: leadId },
                data: {
                  currentStatus: 'analyzing',
                },
              })
            }
          })

          return jsonResponse(
            {
              documentId: document.id,
              leadId: document.leads[0]?.id,
              parseStatus: 'ANALYZING',
              pollUrl: `/api/leads/documents/${document.id}/status`,
              retriedBy: principal.userId,
            },
            202,
          )
        } catch (error) {
          const message = sanitizeErrorMessage(error)

          await prisma.leadDocument.update({
            where: { id: document.id },
            data: {
              parseStatus: 'FAILED',
              lastError: message,
            },
          })

          return jsonResponse(
            {
              error: 'Retry failed',
              details: message,
              documentId: document.id,
            },
            500,
          )
        }
      },
    },
  },
})
