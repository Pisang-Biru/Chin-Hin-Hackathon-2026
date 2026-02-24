import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { decideDeepAgentsStep, startDeepAgentsSession } from './deep-agents-client'

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.AGENTS_BASE_URL = 'http://localhost:8100'
  process.env.AGENTS_API_TOKEN = 'token-123'
  process.env.AGENTS_HTTP_TIMEOUT_MS = '200'
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('deep-agents-client', () => {
  it('calls start endpoint with auth header and parses response', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          sessionId: 's1',
          status: 'PENDING_APPROVAL',
          pendingStep: {
            stepId: 'step-1',
            stepIndex: 1,
            subagentName: 'bu_selector',
            requestPayload: {},
          },
          agentMessages: [],
          draft: {},
          finalResult: null,
          error: null,
        }),
        { status: 200 },
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await startDeepAgentsSession({
      sessionId: 's1',
      routingRunId: 'rr1',
      leadId: 'lead1',
      triggeredBy: 'system:auto',
      threadId: 'thread1',
    })

    expect(result.status).toBe('PENDING_APPROVAL')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://localhost:8100/v1/sessions/start')
    expect(init.headers).toMatchObject({
      authorization: 'Bearer token-123',
      'content-type': 'application/json',
    })
  })

  it('handles timeout by aborting request', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(signal.reason)
        })
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      decideDeepAgentsStep({
        sessionId: 's-timeout',
        stepId: 'step-timeout',
        decision: 'APPROVE',
        reviewerId: 'u1',
      }),
    ).rejects.toBeTruthy()
  })

  it('throws typed error on non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: 'Invalid token' }), { status: 401 }),
      ),
    )

    await expect(
      decideDeepAgentsStep({
        sessionId: 's2',
        stepId: 'step-2',
        decision: 'REJECT',
        reviewerId: 'u2',
        reason: 'No fit',
      }),
    ).rejects.toThrow('Deep agents request failed (401): Invalid token')
  })
})
