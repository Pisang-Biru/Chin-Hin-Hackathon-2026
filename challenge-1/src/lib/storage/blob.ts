import { BlobServiceClient } from '@azure/storage-blob'
import type { BlockBlobClient } from '@azure/storage-blob'

import { getRequiredEnv } from '#/lib/server/env'

function getContainerClient() {
  const connectionString = getRequiredEnv('AZURE_BLOB_CONNECTION_STRING')
  const containerName = getRequiredEnv('AZURE_BLOB_CONTAINER')

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  return blobServiceClient.getContainerClient(containerName)
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
}

function buildBlobPath(documentId: string, fileName: string): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')

  return `lead-documents/${year}/${month}/${documentId}/${sanitizeFileName(fileName)}`
}

export async function uploadLeadDocument(
  file: File,
  documentId: string,
  bytes?: Uint8Array,
): Promise<{ blobPath: string; etag: string | null; contentType: string; sizeBytes: number }> {
  const payload = bytes ?? new Uint8Array(await file.arrayBuffer())
  const blobPath = buildBlobPath(documentId, file.name)

  const containerClient = getContainerClient()
  await containerClient.createIfNotExists()

  const blockBlobClient = containerClient.getBlockBlobClient(blobPath)
  const result = await blockBlobClient.uploadData(payload, {
    blobHTTPHeaders: {
      blobContentType: file.type || 'application/octet-stream',
    },
  })

  return {
    blobPath,
    etag: result.etag ?? null,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: payload.byteLength,
  }
}

export function buildBlobClient(blobPath: string): BlockBlobClient {
  return getContainerClient().getBlockBlobClient(blobPath)
}

export async function downloadLeadDocument(blobPath: string): Promise<Uint8Array> {
  const blobClient = buildBlobClient(blobPath)
  const response = await blobClient.downloadToBuffer()

  return new Uint8Array(response)
}
