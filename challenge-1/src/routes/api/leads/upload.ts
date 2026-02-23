import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '@/db'
import { getDocumentModelName, startAnalyzeFromStream } from '@/lib/azure/docintel'
import { validateUploadFile } from '@/lib/leads/upload-validation'
import { requireRoles } from '@/lib/server/auth-guard'
import { jsonResponse, sanitizeErrorMessage } from '@/lib/server/json-response'
import { uploadLeadDocument } from '@/lib/storage/blob'

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export const Route = createFileRoute('/api/leads/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authz = await requireRoles(request, ['admin', 'synergy'])
        if (authz.response) {
          return authz.response
        }
        const principal = authz.principal!

        const formData = await request.formData()
        const fileEntry = formData.get('file')

        if (!(fileEntry instanceof File)) {
          return jsonResponse({ error: 'Expected multipart field "file"' }, 400)
        }

        const validation = validateUploadFile(fileEntry)
        if (!validation.isValid || !validation.normalizedMimeType) {
          return jsonResponse({ error: 'Invalid upload', errors: validation.errors }, 400)
        }

        const fileBytes = new Uint8Array(await fileEntry.arrayBuffer())
        const contentHash = await sha256Hex(fileBytes)

        const bootstrap = await prisma.$transaction(async (tx) => {
          const document = await tx.leadDocument.create({
            data: {
              fileName: fileEntry.name,
              mimeType: validation.normalizedMimeType,
              storagePath: 'pending',
              fileSizeBytes: fileEntry.size,
              contentHash,
              parseStatus: 'UPLOADED',
            },
          })

          const lead = await tx.lead.create({
            data: {
              sourceDocumentId: document.id,
              intakeChannel: 'FILE_UPLOAD',
              currentStatus: 'ingesting',
            },
          })

          return { document, lead }
        })

        try {
          const uploadResult = await uploadLeadDocument(
            fileEntry,
            bootstrap.document.id,
            fileBytes,
          )

          const model = getDocumentModelName()
          const operation = await startAnalyzeFromStream({
            mimeType: validation.normalizedMimeType,
            bytes: fileBytes,
            model,
          })

          await prisma.leadDocument.update({
            where: { id: bootstrap.document.id },
            data: {
              storagePath: uploadResult.blobPath,
              blobEtag: uploadResult.etag,
              parseStatus: 'ANALYZING',
              analysisModel: model,
              analysisOperationId: operation.operationId,
              analysisOperationLocation: operation.operationLocation,
              analysisStartedAt: new Date(),
              lastError: null,
            },
          })

          return jsonResponse(
            {
              documentId: bootstrap.document.id,
              leadId: bootstrap.lead.id,
              parseStatus: 'ANALYZING',
              pollUrl: `/api/leads/documents/${bootstrap.document.id}/status`,
              uploadedBy: principal.userId,
            },
            202,
          )
        } catch (error) {
          await prisma.$transaction(async (tx) => {
            await tx.leadDocument.update({
              where: { id: bootstrap.document.id },
              data: {
                parseStatus: 'FAILED',
                lastError: sanitizeErrorMessage(error),
              },
            })

            await tx.lead.update({
              where: { id: bootstrap.lead.id },
              data: {
                currentStatus: 'failed',
              },
            })
          })

          return jsonResponse(
            {
              error: 'Failed to upload and start extraction',
              details: sanitizeErrorMessage(error),
              documentId: bootstrap.document.id,
              leadId: bootstrap.lead.id,
            },
            500,
          )
        }
      },
    },
  },
})
