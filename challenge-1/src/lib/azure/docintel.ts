import { getRequiredEnv } from '#/lib/server/env'

const DOC_INTEL_API_VERSION = '2024-11-30'

export type DocumentIntelligenceStatus =
  | 'notStarted'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'unknown'

export function getDocumentModelName(): string {
  return process.env.AZURE_DOCUMENT_MODEL || 'prebuilt-layout'
}

function getEndpoint(): string {
  return getRequiredEnv('AZURE_DOCUMENT_ENDPOINT').replace(/\/+$/, '')
}

function getApiKey(): string {
  return getRequiredEnv('AZURE_DOCUMENT_KEY')
}

function getAnalyzeUrl(model: string): string {
  const endpoint = getEndpoint()
  return `${endpoint}/documentintelligence/documentModels/${encodeURIComponent(model)}:analyze?api-version=${DOC_INTEL_API_VERSION}`
}

function parseOperationId(operationLocation: string): string {
  const match = operationLocation.match(/analyzeResults\/([^/?]+)/)
  return match?.[1] ?? ''
}

export async function startAnalyzeFromStream(input: {
  mimeType: string
  bytes: Uint8Array
  model?: string
}): Promise<{ operationId: string; operationLocation: string }> {
  const model = input.model || getDocumentModelName()
  const response = await fetch(getAnalyzeUrl(model), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': getApiKey(),
      'Content-Type': input.mimeType || 'application/octet-stream',
    },
    body: input.bytes,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Document Intelligence analyze start failed (${response.status}): ${errorBody}`)
  }

  const operationLocation = response.headers.get('operation-location')
  if (!operationLocation) {
    throw new Error('Document Intelligence response missing operation-location header')
  }

  return {
    operationId: parseOperationId(operationLocation),
    operationLocation,
  }
}

export async function getAnalyzeResult(operationLocation: string): Promise<{
  status: DocumentIntelligenceStatus
  result?: unknown
  error?: unknown
  raw?: unknown
}> {
  const response = await fetch(operationLocation, {
    method: 'GET',
    headers: {
      'Ocp-Apim-Subscription-Key': getApiKey(),
    },
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Document Intelligence polling failed (${response.status}): ${errorBody}`)
  }

  const payload = (await response.json()) as {
    status?: string
    analyzeResult?: unknown
    error?: unknown
  }

  const rawStatus = payload.status ?? 'unknown'
  const normalizedStatus: DocumentIntelligenceStatus =
    rawStatus === 'notStarted' ||
    rawStatus === 'running' ||
    rawStatus === 'succeeded' ||
    rawStatus === 'failed'
      ? rawStatus
      : 'unknown'

  return {
    status: normalizedStatus,
    result: payload.analyzeResult,
    error: payload.error,
    raw: payload,
  }
}
