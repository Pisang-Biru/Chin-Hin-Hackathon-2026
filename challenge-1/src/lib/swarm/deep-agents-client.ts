import { z } from 'zod'

const SESSION_STATUS_VALUES = [
  'IN_PROGRESS',
  'PENDING_APPROVAL',
  'COMPLETED',
  'REJECTED',
  'FAILED',
] as const

export type DeepAgentsSessionStatus = (typeof SESSION_STATUS_VALUES)[number]

const agentMessageSchema = z.object({
  agentId: z.string().min(1),
  recipientId: z.string().nullable(),
  messageType: z.string().min(1),
  content: z.string().min(1),
  evidenceRefs: z.record(z.string(), z.unknown()).default({}),
})

const pendingStepSchema = z.object({
  stepId: z.string().min(1),
  stepIndex: z.number().int().positive(),
  subagentName: z.string().min(1),
  requestPayload: z.record(z.string(), z.unknown()).default({}),
})

const buRecommendationSchema = z.object({
  businessUnitCode: z.string().min(1),
  role: z.enum(['PRIMARY', 'CROSS_SELL']),
  finalScore: z.number(),
  confidence: z.number(),
  reasonSummary: z.string().min(1),
})

const skuProposalSchema = z.object({
  businessUnitCode: z.string().min(1),
  buSkuId: z.string().min(1),
  rank: z.number().int().positive(),
  confidence: z.number(),
  rationale: z.string().min(1),
})

const finalResultSchema = z.object({
  summary: z.string().min(1),
  buRecommendations: z.array(buRecommendationSchema).default([]),
  skuProposals: z.array(skuProposalSchema).default([]),
  agentMessages: z.array(agentMessageSchema).default([]),
})

const sessionEnvelopeSchema = z.object({
  sessionId: z.string().min(1),
  status: z.enum(SESSION_STATUS_VALUES),
  pendingStep: pendingStepSchema.nullable().optional(),
  agentMessages: z.array(agentMessageSchema).default([]),
  draft: z.record(z.string(), z.unknown()).default({}),
  finalResult: finalResultSchema.nullable().optional(),
  error: z.string().nullable().optional(),
})

export type DeepAgentsSessionEnvelope = z.infer<typeof sessionEnvelopeSchema>
export type DeepAgentsFinalResult = z.infer<typeof finalResultSchema>

type DeepAgentsClientConfig = {
  baseUrl: string
  apiToken: string
  timeoutMs: number
}

function getDeepAgentsClientConfig(): DeepAgentsClientConfig {
  const baseUrl = process.env.AGENTS_BASE_URL?.trim() || 'http://127.0.0.1:8100'
  const apiToken = process.env.AGENTS_API_TOKEN?.trim() || ''

  const timeoutRaw = process.env.AGENTS_HTTP_TIMEOUT_MS?.trim()
  const timeoutCandidate = timeoutRaw ? Number(timeoutRaw) : 12_000
  const timeoutMs = Number.isFinite(timeoutCandidate) && timeoutCandidate > 0 ? timeoutCandidate : 12_000

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiToken,
    timeoutMs,
  }
}

async function fetchJsonWithTimeout(
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const config = getDeepAgentsClientConfig()
  if (!config.apiToken) {
    throw new Error('AGENTS_API_TOKEN is required when SWARM_ENGINE=deep_agents.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new Error('Deep agents request timed out.'))
  }, config.timeoutMs)

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
      signal: controller.signal,
    })

    const payload = (await response.json().catch(() => null)) as unknown
    if (!response.ok) {
      const details =
        payload && typeof payload === 'object' && 'detail' in payload
          ? String((payload as { detail: unknown }).detail)
          : response.statusText
      throw new Error(`Deep agents request failed (${response.status}): ${details}`)
    }

    return payload
  } finally {
    clearTimeout(timeout)
  }
}

export async function startDeepAgentsSession(input: {
  sessionId: string
  routingRunId: string
  leadId: string
  triggeredBy: string
  threadId: string
}): Promise<DeepAgentsSessionEnvelope> {
  const payload = await fetchJsonWithTimeout('/v1/sessions/start', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  return sessionEnvelopeSchema.parse(payload)
}

export async function decideDeepAgentsStep(input: {
  sessionId: string
  stepId: string
  decision: 'APPROVE' | 'REJECT'
  reviewerId: string
  reason?: string
}): Promise<DeepAgentsSessionEnvelope> {
  const payload = await fetchJsonWithTimeout(
    `/v1/sessions/${encodeURIComponent(input.sessionId)}/steps/${encodeURIComponent(input.stepId)}/decision`,
    {
      method: 'POST',
      body: JSON.stringify({
        decision: input.decision,
        reviewerId: input.reviewerId,
        reason: input.reason,
      }),
    },
  )

  return sessionEnvelopeSchema.parse(payload)
}

export async function getDeepAgentsSession(sessionId: string): Promise<DeepAgentsSessionEnvelope> {
  const payload = await fetchJsonWithTimeout(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
  })
  return sessionEnvelopeSchema.parse(payload)
}
