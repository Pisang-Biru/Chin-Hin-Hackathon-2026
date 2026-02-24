import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'

import { authClient } from '@/lib/auth-client'
import { getAgentAvatar } from '@/lib/swarm/agent-avatar'

type UploadResponse = {
  documentId: string
  leadId: string
  parseStatus: string
  pollUrl: string
}

type StatusResponse = {
  documentId: string
  leadId?: string
  parseStatus: string
  progress?: string
  normalizedFactsCount?: number
  errors?: string[]
  routing?: {
    status: 'COMPLETED' | 'SKIPPED' | 'FAILED'
    routingRunId?: string
    recommendationsCount?: number
    assignmentCount?: number
    reason?: string
    error?: string
  }
}

type SwarmPreviewEvent =
  | {
      type: 'PREVIEW_OPENED'
      leadId: string
      timestamp: string
    }
  | {
      type: 'ROUTING_STARTED'
      leadId: string
      triggeredBy: string
      routingRunId: string
      leadFactsCount: number
      activeRuleSetsCount: number
      timestamp: string
    }
  | {
      type: 'RECOMMENDATION_SELECTED'
      leadId: string
      routingRunId: string
      businessUnitId: string
      businessUnitCode: string
      businessUnitName: string
      role: string
      finalScore: number
      confidence: number
      reasonSummary: string
      timestamp: string
    }
  | {
      type: 'AGENT_TYPING'
      leadId: string
      routingRunId: string
      businessUnitCode: string
      agentId: string
      recipientId: string | null
      messageType: string
      timestamp: string
    }
  | {
      type: 'AGENT_MESSAGE'
      leadId: string
      routingRunId: string
      businessUnitCode: string
      agentId: string
      recipientId: string | null
      messageType: string
      content: string
      timestamp: string
    }
  | {
      type: 'SKU_PROPOSALS'
      leadId: string
      routingRunId: string
      businessUnitCode: string
      proposals: Array<{
        buSkuId: string
        rank: number
        confidence: number
        rationale: string
      }>
      timestamp: string
    }
  | {
      type: 'ROUTING_COMPLETED'
      leadId: string
      routingRunId: string
      recommendationsCount: number
      assignmentCount: number
      scoredBusinessUnits: number
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
  | {
      type: 'ROUTING_FAILED'
      leadId: string
      routingRunId: string
      error: string
      timestamp: string
    }
  | {
      type: 'HEARTBEAT'
      timestamp: string
    }

type LeadDocumentListItem = {
  id: string
  leadId: string | null
  leadStatus: string | null
  latestRoutingRunId: string | null
  fileName: string
  mimeType: string
  fileSizeBytes: number | null
  parseStatus: 'UPLOADED' | 'ANALYZING' | 'EXTRACTED' | 'NORMALIZED' | 'FAILED'
  createdAt: string
  updatedAt: string
  analysisStartedAt: string | null
  analysisCompletedAt: string | null
  lastError: string | null
  normalizedFactsCount: number
  summary: string
}

type LeadDocumentsResponse = {
  documents: LeadDocumentListItem[]
}

function formatBytes(sizeBytes: number | null): string {
  if (sizeBytes === null || sizeBytes <= 0) {
    return '-'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = sizeBytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const precision = unitIndex === 0 ? 0 : 1
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

function getAgentLabel(agentId: string): string {
  return getAgentAvatar(agentId).label
}

export const Route = createFileRoute('/leads/upload')({
  component: LeadsUploadPage,
})

function LeadsUploadPage() {
  const { data: session, isPending: isSessionPending } = authClient.useSession()
  const role = (session?.user as { role?: string } | undefined)?.role

  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [documents, setDocuments] = useState<LeadDocumentListItem[]>([])
  const [isDocumentsLoading, setIsDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [isLivePreviewing, setIsLivePreviewing] = useState(false)
  const [livePreviewLeadId, setLivePreviewLeadId] = useState<string | null>(null)
  const [livePreviewRoutingRunId, setLivePreviewRoutingRunId] = useState<string | null>(null)
  const [livePreviewError, setLivePreviewError] = useState<string | null>(null)
  const [livePreviewEvents, setLivePreviewEvents] = useState<SwarmPreviewEvent[]>([])
  const [typingAgentIds, setTypingAgentIds] = useState<string[]>([])

  const pollStartRef = useRef<number | null>(null)
  const livePreviewSourceRef = useRef<EventSource | null>(null)
  const autoPreviewRunRef = useRef<string | null>(null)

  const canRetry = status?.parseStatus === 'FAILED' && !!status.documentId

  const statusLabel = useMemo(() => {
    if (!status) {
      return 'No file uploaded yet'
    }

    if (status.parseStatus === 'ANALYZING') {
      return `Analyzing (${status.progress || 'running'})`
    }

    if (status.parseStatus === 'NORMALIZED') {
      return `Normalized (${status.normalizedFactsCount || 0} facts)`
    }

    if (status.parseStatus === 'EXTRACTED') {
      return 'Extracted, but no routing-core facts were normalized'
    }

    if (status.parseStatus === 'FAILED') {
      return 'Failed'
    }

    return status.parseStatus
  }, [status])

  async function loadDocuments() {
    setIsDocumentsLoading(true)
    setDocumentsError(null)

    try {
      const response = await fetch('/api/leads/documents')
      const payload = (await response.json()) as LeadDocumentsResponse & { error?: string }

      if (!response.ok) {
        setDocumentsError(payload.error || 'Failed to load documents')
        return
      }

      setDocuments(payload.documents)
    } catch (error) {
      setDocumentsError(error instanceof Error ? error.message : 'Failed to load documents')
    } finally {
      setIsDocumentsLoading(false)
    }
  }

  async function uploadFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!file) {
      setUploadError('Please choose a file first.')
      return
    }

    setUploadError(null)
    setStatus(null)
    setPolling(false)
    setIsUploading(true)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/leads/upload', {
        method: 'POST',
        body: formData,
      })

      const payload = (await response.json()) as UploadResponse & {
        error?: string
        errors?: string[]
      }

      if (!response.ok) {
        setUploadError(payload.error || payload.errors?.join(', ') || 'Upload failed')
        return
      }

      setStatus({
        documentId: payload.documentId,
        leadId: payload.leadId,
        parseStatus: payload.parseStatus,
        progress: 'running',
      })

      pollStartRef.current = Date.now()
      setPolling(true)
      void loadDocuments()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  async function pollStatus(documentId: string) {
    const response = await fetch(`/api/leads/documents/${documentId}/status?liveRouting=1`)
    const payload = (await response.json()) as StatusResponse & { error?: string }

    if (!response.ok) {
      throw new Error(payload.error || 'Status polling failed')
    }

    setStatus(payload)

    if (
      payload.parseStatus === 'NORMALIZED' ||
      payload.parseStatus === 'EXTRACTED' ||
      payload.parseStatus === 'FAILED'
    ) {
      setPolling(false)
      void loadDocuments()
      return
    }

    const elapsed = Date.now() - (pollStartRef.current || Date.now())
    if (elapsed >= 120_000) {
      setPolling(false)
      setUploadError('Polling stopped after 120 seconds. You can refresh status manually.')
    }
  }

  async function retryExtraction() {
    if (!status?.documentId) {
      return
    }

    setUploadError(null)

    const response = await fetch(`/api/leads/documents/${status.documentId}/retry`, {
      method: 'POST',
    })

    const payload = (await response.json()) as {
      parseStatus?: string
      error?: string
      details?: string
    }

    if (!response.ok) {
      setUploadError(payload.error || payload.details || 'Retry failed')
      return
    }

    setStatus((previous) =>
      previous
        ? {
            ...previous,
            parseStatus: payload.parseStatus || 'ANALYZING',
            progress: 'running',
            errors: undefined,
          }
        : previous,
    )
    pollStartRef.current = Date.now()
    setPolling(true)
    void loadDocuments()
  }

  function pushLivePreviewEvent(event: SwarmPreviewEvent) {
    setLivePreviewEvents((previous) => {
      const next = [...previous, event]
      if (next.length > 120) {
        return next.slice(next.length - 120)
      }
      return next
    })
  }

  function stopLivePreview() {
    if (livePreviewSourceRef.current) {
      livePreviewSourceRef.current.close()
      livePreviewSourceRef.current = null
    }
    setIsLivePreviewing(false)
    setTypingAgentIds([])
  }

  function startLivePreview(routingRunId: string) {
    stopLivePreview()
    setLivePreviewError(null)
    setLivePreviewRoutingRunId(routingRunId)
    setLivePreviewEvents([])
    setTypingAgentIds([])
    setIsLivePreviewing(true)

    const source = new EventSource(`/api/routing-runs/${routingRunId}/swarm-events`)
    livePreviewSourceRef.current = source
    let streamCompleted = false

    source.onmessage = (event) => {
      let payload: SwarmPreviewEvent | null = null
      try {
        payload = JSON.parse(event.data) as SwarmPreviewEvent
      } catch {
        return
      }

      if (payload.type === 'HEARTBEAT') {
        return
      }

      if ('leadId' in payload) {
        setLivePreviewLeadId(payload.leadId)
      }

      if (payload.type === 'AGENT_TYPING') {
        setTypingAgentIds((previous) =>
          previous.includes(payload.agentId) ? previous : [...previous, payload.agentId],
        )
      }

      if (payload.type === 'AGENT_MESSAGE') {
        setTypingAgentIds((previous) => previous.filter((agentId) => agentId !== payload.agentId))
      }

      pushLivePreviewEvent(payload)

      if (
        payload.type === 'PREVIEW_SUMMARY' ||
        payload.type === 'ROUTING_COMPLETED' ||
        payload.type === 'ROUTING_FAILED'
      ) {
        streamCompleted = true
        setTypingAgentIds([])
        source.close()
        livePreviewSourceRef.current = null
        setIsLivePreviewing(false)
        void loadDocuments()
      }
    }

    source.onerror = () => {
      if (streamCompleted) {
        return
      }
      setLivePreviewError('Live preview stream disconnected.')
      stopLivePreview()
    }
  }

  function startLiveDelegation(leadId: string) {
    stopLivePreview()
    setLivePreviewError(null)
    setLivePreviewLeadId(leadId)
    setLivePreviewRoutingRunId(null)
    setLivePreviewEvents([])
    setTypingAgentIds([])
    setIsLivePreviewing(true)

    const source = new EventSource(`/api/leads/${leadId}/reroute-live`)
    livePreviewSourceRef.current = source
    let streamCompleted = false

    source.onmessage = (event) => {
      let payload: SwarmPreviewEvent | null = null
      try {
        payload = JSON.parse(event.data) as SwarmPreviewEvent
      } catch {
        return
      }

      if ('leadId' in payload) {
        setLivePreviewLeadId(payload.leadId)
      }
      if ('routingRunId' in payload && payload.routingRunId) {
        setLivePreviewRoutingRunId(payload.routingRunId)
      }

      if (payload.type === 'HEARTBEAT') {
        return
      }
      if (payload.type === 'AGENT_TYPING') {
        setTypingAgentIds((previous) =>
          previous.includes(payload.agentId) ? previous : [...previous, payload.agentId],
        )
      }
      if (payload.type === 'AGENT_MESSAGE') {
        setTypingAgentIds((previous) => previous.filter((agentId) => agentId !== payload.agentId))
      }

      pushLivePreviewEvent(payload)

      if (
        payload.type === 'PREVIEW_SUMMARY' ||
        payload.type === 'ROUTING_COMPLETED' ||
        payload.type === 'ROUTING_FAILED'
      ) {
        streamCompleted = true
        setTypingAgentIds([])
        source.close()
        livePreviewSourceRef.current = null
        setIsLivePreviewing(false)
        if ('routingRunId' in payload && payload.routingRunId) {
          autoPreviewRunRef.current = payload.routingRunId
        }
        void loadDocuments()
      }
    }

    source.onerror = () => {
      if (streamCompleted) {
        return
      }
      setLivePreviewError('Live routing stream disconnected.')
      stopLivePreview()
    }
  }

  useEffect(() => {
    if (!polling || !status?.documentId) {
      return
    }

    const timer = setInterval(() => {
      void pollStatus(status.documentId).catch((error: unknown) => {
        setPolling(false)
        setUploadError(error instanceof Error ? error.message : 'Status polling failed')
      })
    }, 2_000)

    return () => clearInterval(timer)
  }, [polling, status?.documentId])

  useEffect(() => {
    if (!session || (role !== 'admin' && role !== 'synergy')) {
      return
    }

    void loadDocuments()
  }, [session, role])

  useEffect(() => {
    return () => {
      if (livePreviewSourceRef.current) {
        livePreviewSourceRef.current.close()
        livePreviewSourceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!status?.leadId || status.parseStatus !== 'NORMALIZED') {
      return
    }

    if (
      status.routing?.status === 'SKIPPED' &&
      status.routing.reason === 'Live routing pending.'
    ) {
      if (autoPreviewRunRef.current === `live:${status.leadId}`) {
        return
      }

      autoPreviewRunRef.current = `live:${status.leadId}`
      startLiveDelegation(status.leadId)
      return
    }

    const runId =
      status.routing?.status === 'COMPLETED' ? status.routing.routingRunId : undefined
    if (!runId) {
      return
    }

    if (autoPreviewRunRef.current === runId) {
      return
    }

    autoPreviewRunRef.current = runId
    startLivePreview(runId)
  }, [
    status?.leadId,
    status?.parseStatus,
    status?.routing?.status,
    status?.routing?.reason,
    status?.routing?.routingRunId,
  ])

  if (isSessionPending) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 px-6 py-10">
        <p className="text-slate-300">Checking session...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 px-6 py-10">
        <p className="text-slate-300">
          You are not signed in. <Link to="/login" className="text-cyan-300">Go to login</Link>.
        </p>
      </main>
    )
  }

  if (role !== 'admin' && role !== 'synergy') {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 px-6 py-10">
        <p className="text-red-300">Forbidden. Admin or synergy role required.</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 px-6 py-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl">
          <h1 className="text-2xl font-semibold mb-2">Lead Document Intake</h1>
          <p className="text-slate-300 mb-6">
            Upload project lead files (PDF/PNG/JPG). The system stores the file,
            runs Azure Document Intelligence, and writes normalized facts for routing.
          </p>

          <form onSubmit={uploadFile} className="space-y-4">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
            />

            <button
              type="submit"
              disabled={!file || isUploading}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? 'Uploading...' : 'Upload and Start Extraction'}
            </button>
          </form>

          {uploadError ? (
            <p className="mt-4 text-red-300 text-sm">{uploadError}</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl space-y-3">
          <h2 className="text-xl font-semibold">Extraction Status</h2>
          <p className="text-slate-300">{statusLabel}</p>

          {status ? (
            <div className="text-sm text-slate-200 space-y-1">
              <p>
                <span className="text-slate-400">Document ID:</span> {status.documentId}
              </p>
              {status.leadId ? (
                <p>
                  <span className="text-slate-400">Lead ID:</span> {status.leadId}
                </p>
              ) : null}
              {typeof status.normalizedFactsCount === 'number' ? (
                <p>
                  <span className="text-slate-400">Normalized facts:</span>{' '}
                  {status.normalizedFactsCount}
                </p>
              ) : null}
              {status.errors?.length ? (
                <p className="text-red-300">{status.errors.join(' | ')}</p>
              ) : null}
              {status.routing ? (
                <p>
                  <span className="text-slate-400">Routing:</span> {status.routing.status}
                  {status.routing.routingRunId ? (
                    <> ({status.routing.routingRunId})</>
                  ) : null}
                  {typeof status.routing.recommendationsCount === 'number' ? (
                    <> | recommendations: {status.routing.recommendationsCount}</>
                  ) : null}
                  {typeof status.routing.assignmentCount === 'number' ? (
                    <> | assignments: {status.routing.assignmentCount}</>
                  ) : null}
                  {status.routing.reason ? <> | {status.routing.reason}</> : null}
                  {status.routing.error ? (
                    <span className="text-red-300"> | {status.routing.error}</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : null}

          {canRetry ? (
            <button
              onClick={() => {
                void retryExtraction()
              }}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700"
            >
              Retry Extraction
            </button>
          ) : null}

          {status?.leadId ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  status.routing?.routingRunId
                    ? startLivePreview(status.routing.routingRunId)
                    : startLiveDelegation(status.leadId!)
                }
                disabled={isLivePreviewing}
                className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-60"
              >
                {isLivePreviewing &&
                ((status.routing?.routingRunId &&
                  livePreviewRoutingRunId === status.routing.routingRunId) ||
                  (!status.routing?.routingRunId && livePreviewLeadId === status.leadId))
                  ? 'Swarm Preview Running...'
                  : status.routing?.routingRunId
                    ? 'Replay Delegation'
                    : 'Start Live Delegation'}
              </button>
              {isLivePreviewing ? (
                <button
                  type="button"
                  onClick={stopLivePreview}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                >
                  Stop Preview
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Live Swarm Delegation Preview</h2>
              <p className="text-slate-300 text-sm">
                Watch Synergy and BU agents delegate tasks and propose SKUs in real time.
              </p>
            </div>
            {livePreviewLeadId ? (
              <div className="text-xs text-slate-300 space-y-1">
                <p>
                  Lead: <span className="font-mono">{livePreviewLeadId}</span>
                </p>
                {livePreviewRoutingRunId ? (
                  <p>
                    Run: <span className="font-mono">{livePreviewRoutingRunId}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {livePreviewError ? <p className="text-sm text-red-300">{livePreviewError}</p> : null}

          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 max-h-[420px] overflow-y-auto space-y-3">
            {livePreviewEvents.length === 0 ? (
              <p className="text-sm text-slate-400">
                Start a preview from an extracted lead to see the swarm conversation.
              </p>
            ) : (
              livePreviewEvents
                .filter((event) => event.type !== 'HEARTBEAT' && event.type !== 'AGENT_TYPING')
                .map((event, index) => (
                  <article key={`${event.type}-${index}`} className="space-y-1">
                    {event.type === 'PREVIEW_OPENED' ? (
                      <div className="text-center">
                        <p className="inline-block text-xs text-cyan-200 bg-slate-800 border border-slate-700 rounded-full px-3 py-1">
                          Preview opened for lead <span className="font-mono">{event.leadId}</span>
                        </p>
                      </div>
                    ) : null}
                    {event.type === 'ROUTING_STARTED' ? (
                      <div className="text-center">
                        <p className="inline-block text-xs text-cyan-200 bg-slate-800 border border-slate-700 rounded-full px-3 py-1">
                          Routing run <span className="font-mono">{event.routingRunId}</span> started | facts:{' '}
                          {event.leadFactsCount} | active BU rule sets: {event.activeRuleSetsCount}
                        </p>
                      </div>
                    ) : null}
                    {event.type === 'RECOMMENDATION_SELECTED' ? (
                      <div className="text-center">
                        <p className="inline-block text-xs text-emerald-200 bg-slate-800 border border-slate-700 rounded-full px-3 py-1">
                          {event.businessUnitCode} selected ({event.role}) | score {event.finalScore.toFixed(4)} |
                          confidence {event.confidence.toFixed(4)}
                        </p>
                      </div>
                    ) : null}
                    {event.type === 'AGENT_MESSAGE' ? (
                      <div
                        className={`flex items-start gap-2 ${
                          event.agentId === 'synergy_router' ||
                          event.agentId === 'synergy_deterministic_router'
                            ? 'justify-end'
                            : 'justify-start'
                        }`}
                      >
                        {!(event.agentId === 'synergy_router' || event.agentId === 'synergy_deterministic_router') ? (
                          <img
                            src={getAgentAvatar(event.agentId).imagePath}
                            alt={getAgentLabel(event.agentId)}
                            className="h-8 w-8 rounded-md border border-slate-600"
                          />
                        ) : null}
                        <div className="max-w-[75%]">
                          <p className="text-[11px] text-slate-400 mb-1">
                            {getAgentLabel(event.agentId)}
                            {event.recipientId ? ` -> ${getAgentLabel(event.recipientId)}` : ''}
                          </p>
                          <div
                            className={`rounded-2xl px-3 py-2 text-xs ${
                              event.agentId === 'synergy_router' ||
                              event.agentId === 'synergy_deterministic_router'
                                ? 'bg-cyan-700/70 border border-cyan-500/40'
                                : 'bg-slate-800 border border-slate-700'
                            }`}
                          >
                            <p className="text-slate-100">{event.content}</p>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            {new Date(event.timestamp).toLocaleTimeString()} | {event.messageType}
                          </p>
                        </div>
                        {event.agentId === 'synergy_router' || event.agentId === 'synergy_deterministic_router' ? (
                          <img
                            src={getAgentAvatar(event.agentId).imagePath}
                            alt={getAgentLabel(event.agentId)}
                            className="h-8 w-8 rounded-md border border-slate-600"
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {event.type === 'SKU_PROPOSALS' ? (
                      <div className="flex items-start gap-2 justify-start">
                        <img
                          src={getAgentAvatar(`${event.businessUnitCode.toLowerCase()}_agent`).imagePath}
                          alt={event.businessUnitCode}
                          className="h-8 w-8 rounded-md border border-slate-600"
                        />
                        <div className="max-w-[80%] rounded-2xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs">
                          <p className="text-amber-200">{event.businessUnitCode} SKU proposals</p>
                          <ul className="mt-1 space-y-1 text-slate-100">
                            {event.proposals.map((proposal) => (
                              <li key={`${event.businessUnitCode}-${proposal.buSkuId}-${proposal.rank}`}>
                                #{proposal.rank} {proposal.buSkuId} ({proposal.confidence.toFixed(4)}) -{' '}
                                {proposal.rationale}
                              </li>
                            ))}
                          </ul>
                          <p className="text-[11px] text-slate-500 mt-1">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {event.type === 'ROUTING_COMPLETED' ? (
                      <div className="text-center">
                        <p className="inline-block text-xs text-emerald-300 bg-slate-800 border border-slate-700 rounded-full px-3 py-1">
                          Routing completed | run {event.routingRunId} | recommendations: {event.recommendationsCount}
                          {' '}| assignments: {event.assignmentCount}
                        </p>
                      </div>
                    ) : null}
                    {event.type === 'PREVIEW_SUMMARY' ? (
                      <div className="text-center">
                        <p className="inline-block text-xs text-cyan-300 bg-slate-800 border border-slate-700 rounded-full px-3 py-1">
                          Preview summary | run {event.routingRunId} | scored BUs: {event.scoredBusinessUnits}
                        </p>
                      </div>
                    ) : null}
                    {event.type === 'ROUTING_FAILED' ? (
                      <div className="text-center">
                        <p className="inline-block text-xs text-red-300 bg-slate-800 border border-red-700/60 rounded-full px-3 py-1">
                          Routing failed ({event.routingRunId}): {event.error}
                        </p>
                      </div>
                    ) : null}
                  </article>
                ))
            )}

            {typingAgentIds.map((agentId) => {
              const avatar = getAgentAvatar(agentId)
              const isSynergyAgent =
                agentId === 'synergy_router' || agentId === 'synergy_deterministic_router'
              return (
                <div
                  key={`typing-${agentId}`}
                  className={`flex items-start gap-2 ${isSynergyAgent ? 'justify-end' : 'justify-start'}`}
                >
                  {!isSynergyAgent ? (
                    <img
                      src={avatar.imagePath}
                      alt={avatar.label}
                      className="h-8 w-8 rounded-md border border-slate-600"
                    />
                  ) : null}
                  <div className="max-w-[65%]">
                    <p className="text-[11px] text-slate-400 mb-1">{avatar.label}</p>
                    <div className="rounded-2xl px-3 py-2 text-xs bg-slate-800 border border-slate-700">
                      <p className="text-slate-300 animate-pulse">typing ....</p>
                    </div>
                  </div>
                  {isSynergyAgent ? (
                    <img
                      src={avatar.imagePath}
                      alt={avatar.label}
                      className="h-8 w-8 rounded-md border border-slate-600"
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">All Uploaded Documents</h2>
              <p className="text-slate-300 text-sm">
                All uploaded documents with extraction status and routing summary.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void loadDocuments()
              }}
              disabled={isDocumentsLoading}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-60"
            >
              {isDocumentsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {documentsError ? (
            <p className="text-sm text-red-300">{documentsError}</p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-300">
                  <th className="pb-2 pr-3">File</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Lead</th>
                  <th className="pb-2 pr-3">Facts</th>
                  <th className="pb-2 pr-3">Uploaded</th>
                  <th className="pb-2 pr-3">Summary</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id} className="border-b border-slate-800 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{document.fileName}</div>
                      <div className="text-xs text-slate-400">
                        {document.mimeType} • {formatBytes(document.fileSizeBytes)}
                      </div>
                      <div className="font-mono text-xs text-slate-500 mt-1">{document.id}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div>{document.parseStatus}</div>
                      {document.lastError ? (
                        <div className="text-xs text-red-300 mt-1">{document.lastError}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      {document.leadId ? (
                        <>
                          <div className="font-mono text-xs">{document.leadId}</div>
                          <div className="text-xs text-slate-400">{document.leadStatus || '-'}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{document.normalizedFactsCount}</td>
                    <td className="py-2 pr-3 text-slate-300">
                      {new Date(document.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-slate-200">{document.summary}</td>
                    <td className="py-2">
                      {document.latestRoutingRunId ? (
                        <button
                          type="button"
                          onClick={() => startLivePreview(document.latestRoutingRunId!)}
                          disabled={isLivePreviewing}
                          className="px-3 py-1 rounded bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-60 text-xs"
                        >
                          {isLivePreviewing &&
                          livePreviewRoutingRunId === document.latestRoutingRunId
                            ? 'Previewing...'
                            : 'Replay'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!isDocumentsLoading && documents.length === 0 ? (
                  <tr>
                    <td className="py-4 text-slate-400" colSpan={7}>
                      No uploaded documents yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
