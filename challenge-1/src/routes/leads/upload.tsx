import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'

import { authClient } from '@/lib/auth-client'

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

  const pollStartRef = useRef<number | null>(null)

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
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  async function pollStatus(documentId: string) {
    const response = await fetch(`/api/leads/documents/${documentId}/status`)
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
      <div className="max-w-3xl mx-auto space-y-8">
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
        </section>
      </div>
    </main>
  )
}
