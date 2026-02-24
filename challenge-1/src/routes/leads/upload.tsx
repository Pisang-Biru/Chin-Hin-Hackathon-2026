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
    status: 'COMPLETED' | 'SKIPPED' | 'FAILED' | 'PENDING_APPROVAL'
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
      type: 'DELEGATION_APPROVAL_REQUIRED'
      leadId: string
      routingRunId: string
      sessionId: string
      stepId: string
      stepIndex: number
      subagentName: string
      delegatedItem?: string | null
      timestamp: string
    }
  | {
      type: 'DELEGATION_DECISION_APPLIED'
      leadId: string
      routingRunId: string
      sessionId: string
      stepId: string
      decision: 'APPROVED' | 'REJECTED'
      reviewerId: string
      timestamp: string
    }
  | {
      type: 'SESSION_PENDING'
      leadId: string
      routingRunId: string
      sessionId: string
      reason: string
      timestamp: string
    }
  | {
      type: 'HEARTBEAT'
      timestamp: string
      stage?: string
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

function getStatusColor(status: string): string {
  switch (status) {
    case 'UPLOADED':
      return 'bg-slate-500'
    case 'ANALYZING':
      return 'bg-amber-400'
    case 'EXTRACTED':
      return 'bg-blue-400'
    case 'NORMALIZED':
      return 'bg-emerald-400'
    case 'FAILED':
      return 'bg-red-400'
    default:
      return 'bg-slate-400'
  }
}

export const Route = createFileRoute('/leads/upload')({
  component: LeadsUploadPage,
})

// Upload Zone Component
function UploadZone({
  file,
  setFile,
  isUploading,
  onUpload,
}: {
  file: File | null
  setFile: (file: File | null) => void
  isUploading: boolean
  onUpload: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>
}) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files.item(0)
    if (
      droppedFile &&
      (droppedFile.type === 'application/pdf' ||
        droppedFile.type.startsWith('image/'))
    ) {
      setFile(droppedFile)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/60 backdrop-blur-sm p-5 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 hover:shadow-2xl hover:shadow-slate-200/60 dark:hover:shadow-slate-900/60 transition-all duration-200">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-900 dark:text-white">
        <svg
          className="w-5 h-5 text-blue-600 dark:text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        Upload Document
      </h3>

      <form onSubmit={onUpload}>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
            ${
              isDragging
                ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-900/20'
                : file
                  ? 'border-emerald-500/50 bg-emerald-500/5 hover:border-emerald-500/70'
                  : 'border-slate-300 dark:border-slate-600/50 hover:border-slate-400 dark:hover:border-slate-500/50 hover:bg-slate-100 dark:hover:bg-slate-700/30'
            }
          `}
        >
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isUploading}
          />

          {file ? (
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center mx-auto">
                <svg
                  className="w-7 h-7 text-emerald-600 dark:text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                {file.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                {formatBytes(file.size)}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700/50 border border-slate-300 dark:border-slate-600/50 flex items-center justify-center mx-auto">
                <svg
                  className="w-7 h-7 text-slate-500 dark:text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Drag & drop PDF or image
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                or click to browse
              </p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!file || isUploading}
          className="w-full mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-medium text-white shadow-lg shadow-blue-900/20 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-900/30 active:translate-y-px active:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg transition-all duration-200"
        >
          {isUploading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Upload & Start Extraction
            </>
          )}
        </button>
      </form>
    </div>
  )
}

// File Summary Card Component
function FileSummary({
  status,
  canRetry,
  onRetry,
  onStartPreview,
  isPreviewing,
}: {
  status: StatusResponse | null
  canRetry: boolean
  onRetry: () => void
  onStartPreview: () => void
  isPreviewing: boolean
}) {
  const statusLabel = useMemo(() => {
    if (!status) return 'No file uploaded yet'

    switch (status.parseStatus) {
      case 'ANALYZING':
        return `Analyzing (${status.progress || 'running'})`
      case 'NORMALIZED':
        return `Normalized (${status.normalizedFactsCount || 0} facts)`
      case 'EXTRACTED':
        return 'Extracted (no routing facts)'
      case 'FAILED':
        return 'Failed'
      default:
        return status.parseStatus
    }
  }, [status])

  if (!status) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 backdrop-blur-sm p-5 shadow-lg shadow-slate-200/60 h-full flex flex-col justify-center">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-900">
          <svg
            className="w-5 h-5 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Latest File Summary
        </h3>
        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-sm">Upload a file to see its status</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 backdrop-blur-sm p-5 shadow-lg shadow-slate-200/60 hover:shadow-xl hover:shadow-slate-200/70 transition-all duration-200">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-900">
        <svg
          className="w-5 h-5 text-blue-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        Latest File Summary
      </h3>

      <div className="space-y-4">
        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${getStatusColor(status.parseStatus)} ${status.parseStatus === 'ANALYZING' ? 'animate-pulse' : ''}`}
          />
          <span className="text-sm font-medium text-slate-800">
            {statusLabel}
          </span>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-slate-500 text-xs mb-1">Document ID</p>
            <p className="font-mono text-xs text-slate-700 truncate">
              {status.documentId.slice(0, 12)}...
            </p>
          </div>
          {status.leadId && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-slate-500 text-xs mb-1">Lead ID</p>
              <p className="font-mono text-xs text-slate-700 truncate">
                {status.leadId.slice(0, 12)}...
              </p>
            </div>
          )}
          {typeof status.normalizedFactsCount === 'number' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-slate-500 text-xs mb-1">Normalized Facts</p>
              <p className="text-lg font-semibold text-blue-600">
                {status.normalizedFactsCount}
              </p>
            </div>
          )}
          {status.routing?.recommendationsCount !== undefined && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-slate-500 text-xs mb-1">Recommendations</p>
              <p className="text-lg font-semibold text-emerald-600">
                {status.routing.recommendationsCount}
              </p>
            </div>
          )}
        </div>

        {/* Routing Status */}
        {status.routing && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-slate-500 text-xs mb-1">Routing Status</p>
            <p className="text-sm flex items-center gap-2">
              <span
                className={
                  status.routing.status === 'COMPLETED'
                    ? 'text-emerald-600'
                    : status.routing.status === 'PENDING_APPROVAL'
                      ? 'text-amber-600'
                    : 'text-slate-700'
                }
              >
                {status.routing.status}
              </span>
              {status.routing.assignmentCount !== undefined && (
                <span className="text-slate-600">
                  | {status.routing.assignmentCount} assignments
                </span>
              )}
              {status.routing.status === 'PENDING_APPROVAL' &&
                status.routing.reason && (
                  <span className="text-amber-700">| {status.routing.reason}</span>
                )}
            </p>
          </div>
        )}

        {/* Errors */}
        {(status.errors?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-red-700 text-xs">{status.errors?.join(' | ')}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {status.leadId && (
            <button
              onClick={onStartPreview}
              disabled={isPreviewing}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-900/20 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-900/30 active:translate-y-px active:shadow-sm disabled:opacity-50 transition-all duration-200"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {isPreviewing ? 'Preview Running...' : 'Live Swarm Preview'}
            </button>
          )}
          {canRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2.5 text-sm font-medium text-white shadow-md shadow-amber-900/20 hover:bg-amber-500 hover:shadow-lg hover:shadow-amber-900/30 active:translate-y-px active:shadow-sm transition-all duration-200"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// File History Table Component
function FileHistory({
  documents,
  isLoading,
  error,
  onRefresh,
  onReplay,
}: {
  documents: LeadDocumentListItem[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  onReplay: (routingRunId: string) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 backdrop-blur-sm p-5 shadow-lg shadow-slate-200/60">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-900">
          <svg
            className="w-5 h-5 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          File History
        </h3>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-50 transition-all duration-150"
        >
          <svg
            className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-red-500/30 bg-red-500/10 mb-4">
          <span className="text-red-700 text-sm">{error}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 text-xs uppercase tracking-wider">
              <th className="pb-3 pr-4 font-medium">File Name</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 pr-4 font-medium">Facts</th>
              <th className="pb-3 pr-4 font-medium">Uploaded</th>
              <th className="pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {documents.map((doc) => (
              <tr
                key={doc.id}
                className="hover:bg-slate-50 transition-colors duration-150"
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        {doc.fileName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatBytes(doc.fileSizeBytes)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border
                    ${
                      doc.parseStatus === 'NORMALIZED'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
                        : doc.parseStatus === 'ANALYZING'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-700'
                          : doc.parseStatus === 'FAILED'
                            ? 'bg-red-500/10 border-red-500/30 text-red-700'
                            : doc.parseStatus === 'EXTRACTED'
                              ? 'bg-blue-500/10 border-blue-500/30 text-blue-700'
                              : 'bg-slate-500/10 border-slate-500/30 text-slate-700'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${getStatusColor(doc.parseStatus)} ${doc.parseStatus === 'ANALYZING' ? 'animate-pulse' : ''}`}
                    />
                    {doc.parseStatus}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={
                      doc.normalizedFactsCount > 0
                        ? 'text-blue-400 font-medium'
                        : 'text-slate-600'
                    }
                  >
                    {doc.normalizedFactsCount}
                  </span>
                </td>
                <td className="py-3 pr-4 text-slate-500 text-xs">
                  {new Date(doc.createdAt).toLocaleString()}
                </td>
                <td className="py-3">
                  {doc.latestRoutingRunId ? (
                    <button
                      onClick={() => {
                        if (doc.latestRoutingRunId) {
                          onReplay(doc.latestRoutingRunId)
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-medium transition-colors"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Replay Swarm
                    </button>
                  ) : (
                    <span className="text-slate-700 text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && documents.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-4">
                      <svg
                        className="w-8 h-8 text-slate-600 opacity-50"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <p className="text-slate-500 text-sm">
                      No documents uploaded yet
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Swarm Chat Panel Component
function SwarmChatPanel({
  events,
  isPreviewing,
  workingText,
  lastActivityAt,
  dots,
  error,
  leadId,
  routingRunId,
  typingAgents,
  approvingStepId,
  rejectingStepId,
  onApproveDelegationStep,
  onRejectDelegationStep,
  onStop,
}: {
  events: SwarmPreviewEvent[]
  isPreviewing: boolean
  workingText: string
  lastActivityAt: number | null
  dots: number
  error: string | null
  leadId: string | null
  routingRunId: string | null
  typingAgents: string[]
  approvingStepId: string | null
  rejectingStepId: string | null
  onApproveDelegationStep: (stepId: string) => Promise<void>
  onRejectDelegationStep: (stepId: string) => Promise<void>
  onStop: () => void
}) {
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 backdrop-blur-sm shadow-lg shadow-slate-200/60 flex flex-col h-full min-h-[600px]">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-900">
              <svg
                className="w-5 h-5 text-indigo-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
                />
              </svg>
              Swarm Live Chat
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Real-time AI agent conversations
            </p>
          </div>
          {isPreviewing && (
            <button
              onClick={onStop}
              className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-700 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 10h.01M15 10h.01M12 14h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          )}
        </div>

        {/* IDs */}
        {(leadId || routingRunId) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {leadId && (
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600">
                Lead:{' '}
                <span className="font-mono text-blue-700">
                  {leadId.slice(0, 8)}...
                </span>
              </span>
            )}
            {routingRunId && (
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600">
                Run:{' '}
                <span className="font-mono text-indigo-700">
                  {routingRunId.slice(0, 8)}...
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Status Bar */}
      {isPreviewing && (
        <div className="px-4 py-3 bg-blue-500/10 border-b border-blue-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <p className="text-xs text-blue-700">
                {workingText}
                {'.'.repeat(dots)}
              </p>
            </div>
            {lastActivityAt && (
              <p className="text-xs text-blue-700/70">
                {Math.max(0, Math.floor((Date.now() - lastActivityAt) / 1000))}s
                ago
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="text-sm">
              {isPreviewing
                ? 'Waiting for swarm messages...'
                : 'Start a preview to see the conversation'}
            </p>
          </div>
        ) : (
          events
            .filter((e) => e.type !== 'HEARTBEAT' && e.type !== 'AGENT_TYPING')
            .map((event, index) => (
              <ChatMessage
                key={`${event.type}-${index}`}
                event={event}
                approvingStepId={approvingStepId}
                rejectingStepId={rejectingStepId}
                onApproveDelegationStep={onApproveDelegationStep}
                onRejectDelegationStep={onRejectDelegationStep}
              />
            ))
        )}

        {/* Typing Indicators */}
        {typingAgents.map((agentId) => (
          <TypingIndicator key={`typing-${agentId}`} agentId={agentId} />
        ))}

        <div ref={chatEndRef} />
      </div>
    </div>
  )
}

// Chat Message Component
function ChatMessage({
  event,
  approvingStepId,
  rejectingStepId,
  onApproveDelegationStep,
  onRejectDelegationStep,
}: {
  event: SwarmPreviewEvent
  approvingStepId: string | null
  rejectingStepId: string | null
  onApproveDelegationStep: (stepId: string) => Promise<void>
  onRejectDelegationStep: (stepId: string) => Promise<void>
}) {
  const getAvatar = getAgentAvatar
  const getLabel = getAgentLabel

  if (event.type === 'AGENT_MESSAGE') {
    const isSynergy =
      event.agentId === 'synergy_router' ||
      event.agentId === 'synergy_deterministic_router'

    return (
      <div
        className={`flex items-start gap-3 ${isSynergy ? 'flex-row-reverse' : ''}`}
      >
        <img
          src={getAvatar(event.agentId).imagePath}
          alt={getLabel(event.agentId)}
          className="w-8 h-8 rounded-lg border border-slate-200"
        />
        <div
          className={`max-w-[80%] ${isSynergy ? 'items-end' : 'items-start'}`}
        >
          <p className="text-xs text-slate-500 mb-1">
            {getLabel(event.agentId)}
            {event.recipientId && <span> → {getLabel(event.recipientId)}</span>}
          </p>
          <div
            className={`rounded-xl px-4 py-2.5 text-sm ${
              isSynergy
                ? 'bg-blue-50 border border-blue-200 text-blue-900'
                : 'bg-slate-100 border border-slate-200 text-slate-800'
            }`}
          >
            <p className="leading-relaxed">{event.content}</p>
          </div>
          <p className="text-[10px] text-slate-600 mt-1">
            {new Date(event.timestamp).toLocaleTimeString()}
          </p>
        </div>
      </div>
    )
  }

  if (event.type === 'RECOMMENDATION_SELECTED') {
    return (
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-xs shadow-sm shadow-emerald-900/10">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {event.businessUnitCode} selected • Score:{' '}
          {event.finalScore.toFixed(3)}
        </span>
      </div>
    )
  }

  if (event.type === 'SKU_PROPOSALS') {
    return (
      <div className="flex items-start gap-3">
        <img
          src={
            getAvatar(`${event.businessUnitCode.toLowerCase()}_agent`).imagePath
          }
          alt={event.businessUnitCode}
          className="w-8 h-8 rounded-lg border border-slate-200"
        />
        <div className="max-w-[80%]">
          <p className="text-xs text-slate-500 mb-1">
            {event.businessUnitCode} SKU Proposals
          </p>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 shadow-sm shadow-amber-900/10">
            <ul className="space-y-1.5 text-sm text-amber-800">
              {event.proposals.map((p) => (
                <li
                  key={`${event.businessUnitCode}-${p.buSkuId}`}
                  className="flex items-center gap-2"
                >
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xs font-medium">
                    {p.rank}
                  </span>
                  <span className="font-medium">{p.buSkuId}</span>
                  <span className="text-amber-700/70 text-xs">
                    ({p.confidence.toFixed(3)})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  if (event.type === 'ROUTING_COMPLETED') {
    return (
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-700 text-sm font-medium shadow-sm shadow-emerald-900/10">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Routing Complete • {event.recommendationsCount} recommendations •{' '}
          {event.assignmentCount} assignments
        </span>
      </div>
    )
  }

  if (event.type === 'ROUTING_FAILED') {
    return (
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 border border-red-500/40 text-red-700 text-sm font-medium shadow-sm shadow-red-900/10">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Routing Failed: {event.error}
        </span>
      </div>
    )
  }

  if (event.type === 'DELEGATION_APPROVAL_REQUIRED') {
    const isApproving = approvingStepId === event.stepId
    const isRejecting = rejectingStepId === event.stepId
    const isWorking = isApproving || isRejecting
    return (
      <div className="flex justify-center">
        <div className="rounded-xl bg-amber-500/20 border border-amber-500/40 px-4 py-3 text-amber-900 text-sm shadow-sm shadow-amber-900/10 max-w-[85%]">
          <p className="font-medium">
            Approval Required • {event.subagentName} (step {event.stepIndex})
          </p>
          <p className="text-xs mt-1 text-amber-800">
            Delegated item:{' '}
            <span className="font-medium">
              {event.delegatedItem || `Work package for ${event.subagentName}`}
            </span>
          </p>
          <p className="text-xs mt-1 text-amber-800">
            Review and approve to continue the delegation flow.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void onApproveDelegationStep(event.stepId)
              }}
              disabled={isWorking}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-500 disabled:opacity-50"
            >
              {isApproving ? 'Approving...' : 'Approve Step'}
            </button>
            <button
              type="button"
              onClick={() => {
                void onRejectDelegationStep(event.stepId)
              }}
              disabled={isWorking}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-md shadow-rose-900/20 hover:bg-rose-500 disabled:opacity-50"
            >
              {isRejecting ? 'Rejecting...' : 'Reject Step'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (event.type === 'DELEGATION_DECISION_APPLIED') {
    return (
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-800 text-sm font-medium shadow-sm shadow-blue-900/10">
          Delegation {event.decision.toLowerCase()} by {event.reviewerId}
        </span>
      </div>
    )
  }

  if (event.type === 'SESSION_PENDING') {
    return (
      <div className="flex justify-center">
        <div className="rounded-xl bg-amber-500/20 border border-amber-500/40 px-4 py-3 text-amber-900 text-sm font-medium shadow-sm shadow-amber-900/10 max-w-[85%]">
          <p>Session Pending: {event.reason}</p>
        </div>
      </div>
    )
  }

  return null
}

// Typing Indicator Component
function TypingIndicator({ agentId }: { agentId: string }) {
  const avatar = getAgentAvatar(agentId)
  const isSynergy =
    agentId === 'synergy_router' || agentId === 'synergy_deterministic_router'

  return (
    <div
      className={`flex items-start gap-3 ${isSynergy ? 'flex-row-reverse' : ''}`}
    >
      <img
        src={avatar.imagePath}
        alt={avatar.label}
        className="w-8 h-8 rounded-lg border border-slate-200 opacity-60"
      />
      <div
        className={`rounded-xl px-4 py-3 shadow-sm ${
          isSynergy
            ? 'bg-blue-600/10 border border-blue-500/30'
            : 'bg-slate-100 border border-slate-200'
        }`}
      >
        <div className="flex gap-1">
          <span
            className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  )
}

// Main Page Component
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
  const [livePreviewLeadId, setLivePreviewLeadId] = useState<string | null>(
    null,
  )
  const [livePreviewRoutingRunId, setLivePreviewRoutingRunId] = useState<
    string | null
  >(null)
  const [livePreviewError, setLivePreviewError] = useState<string | null>(null)
  const [livePreviewEvents, setLivePreviewEvents] = useState<
    SwarmPreviewEvent[]
  >([])
  const [approvingDelegationStepId, setApprovingDelegationStepId] = useState<
    string | null
  >(null)
  const [typingAgentIds, setTypingAgentIds] = useState<string[]>([])
  const [livePreviewWorkingText, setLivePreviewWorkingText] = useState(
    'Waiting for swarm updates',
  )
  const [livePreviewLastActivityAt, setLivePreviewLastActivityAt] = useState<
    number | null
  >(null)
  const [livePreviewDots, setLivePreviewDots] = useState(1)

  const pollStartRef = useRef<number | null>(null)
  const livePreviewSourceRef = useRef<EventSource | null>(null)
  const autoPreviewRunRef = useRef<string | null>(null)

  const canRetry = status?.parseStatus === 'FAILED' && !!status.documentId

  async function loadDocuments() {
    setIsDocumentsLoading(true)
    setDocumentsError(null)

    try {
      const response = await fetch('/api/leads/documents')
      const payload = (await response.json()) as LeadDocumentsResponse & {
        error?: string
      }

      if (!response.ok) {
        setDocumentsError(payload.error || 'Failed to load documents')
        return
      }

      setDocuments(payload.documents)
    } catch (error) {
      setDocumentsError(
        error instanceof Error ? error.message : 'Failed to load documents',
      )
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
        setUploadError(
          payload.error || payload.errors?.join(', ') || 'Upload failed',
        )
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
      setFile(null)
      void loadDocuments()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  async function pollStatus(documentId: string) {
    const response = await fetch(
      `/api/leads/documents/${documentId}/status?liveRouting=1`,
    )
    const payload = (await response.json()) as StatusResponse & {
      error?: string
    }

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
      setUploadError(
        'Polling stopped after 120 seconds. You can refresh status manually.',
      )
    }
  }

  async function retryExtraction() {
    if (!status?.documentId) return

    setUploadError(null)

    const response = await fetch(
      `/api/leads/documents/${status.documentId}/retry`,
      {
        method: 'POST',
      },
    )

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

  function updateLiveWorkingText(event: SwarmPreviewEvent) {
    if (event.type === 'HEARTBEAT') {
      if (event.stage === 'replay') {
        setLivePreviewWorkingText('Replaying stored swarm conversation')
        return
      }
      setLivePreviewWorkingText('Swarm is processing routing and delegation')
      return
    }

    if (event.type === 'ROUTING_STARTED') {
      setLivePreviewWorkingText(
        'Evaluating routing rules and preparing BU handoff',
      )
      return
    }

    if (event.type === 'RECOMMENDATION_SELECTED') {
      setLivePreviewWorkingText(
        `Delegating ${event.businessUnitCode} agent review`,
      )
      return
    }

    if (event.type === 'AGENT_MESSAGE') {
      setLivePreviewWorkingText(
        `${getAgentLabel(event.agentId)} sent an update`,
      )
      return
    }

    if (event.type === 'DELEGATION_APPROVAL_REQUIRED') {
      setLivePreviewWorkingText(
        `Waiting Synergy approval for ${event.subagentName}`,
      )
      return
    }

    if (event.type === 'DELEGATION_DECISION_APPLIED') {
      setLivePreviewWorkingText(
        `Decision ${event.decision.toLowerCase()} for delegation step`,
      )
      return
    }

    if (event.type === 'SESSION_PENDING') {
      setLivePreviewWorkingText(event.reason)
      return
    }

    if (event.type === 'ROUTING_COMPLETED') {
      setLivePreviewWorkingText('Routing completed')
      return
    }

    setLivePreviewWorkingText('Swarm session active')
  }

  function stopLivePreview() {
    if (livePreviewSourceRef.current) {
      livePreviewSourceRef.current.close()
      livePreviewSourceRef.current = null
    }
    setIsLivePreviewing(false)
    setTypingAgentIds([])
    setLivePreviewLastActivityAt(null)
    setLivePreviewWorkingText('Waiting for swarm updates')
  }

  function startLivePreview(routingRunId: string) {
    stopLivePreview()
    setLivePreviewError(null)
    setLivePreviewRoutingRunId(routingRunId)
    setLivePreviewEvents([])
    setTypingAgentIds([])
    setLivePreviewWorkingText('Connecting to swarm replay stream')
    setLivePreviewLastActivityAt(Date.now())
    setIsLivePreviewing(true)

    const source = new EventSource(
      `/api/routing-runs/${routingRunId}/swarm-events`,
    )
    livePreviewSourceRef.current = source
    let streamCompleted = false

    source.onmessage = (event) => {
      let payload: SwarmPreviewEvent | null = null
      try {
        payload = JSON.parse(event.data) as SwarmPreviewEvent
      } catch {
        return
      }
      setLivePreviewLastActivityAt(Date.now())
      updateLiveWorkingText(payload)

      if (payload.type === 'HEARTBEAT') return

      if ('leadId' in payload) {
        setLivePreviewLeadId(payload.leadId)
      }

      if (payload.type === 'AGENT_TYPING') {
        setTypingAgentIds((previous) =>
          previous.includes(payload.agentId)
            ? previous
            : [...previous, payload.agentId],
        )
      }

      if (payload.type === 'AGENT_MESSAGE') {
        setTypingAgentIds((previous) =>
          previous.filter((agentId) => agentId !== payload.agentId),
        )
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
      if (streamCompleted) return
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
    setLivePreviewWorkingText('Connecting to live swarm delegation stream')
    setLivePreviewLastActivityAt(Date.now())
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
      setLivePreviewLastActivityAt(Date.now())
      updateLiveWorkingText(payload)

      if ('leadId' in payload) {
        setLivePreviewLeadId(payload.leadId)
      }
      if ('routingRunId' in payload && payload.routingRunId) {
        setLivePreviewRoutingRunId(payload.routingRunId)
      }

      if (payload.type === 'HEARTBEAT') return
      if (payload.type === 'AGENT_TYPING') {
        setTypingAgentIds((previous) =>
          previous.includes(payload.agentId)
            ? previous
            : [...previous, payload.agentId],
        )
      }
      if (payload.type === 'AGENT_MESSAGE') {
        setTypingAgentIds((previous) =>
          previous.filter((agentId) => agentId !== payload.agentId),
        )
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
      if (streamCompleted) return
      setLivePreviewError('Live routing stream disconnected.')
      stopLivePreview()
    }
  }

  function openDelegationApprovals() {
    window.open('/synergy/approvals', '_blank', 'noopener,noreferrer')
  }

  async function approveDelegationStep(stepId: string) {
    setApprovingDelegationStepId(stepId)
    setLivePreviewError(null)

    try {
      const response = await fetch(`/api/synergy/delegations/${stepId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      })
      const payload = (await response.json()) as {
        error?: string
        details?: string
      }
      if (!response.ok) {
        setLivePreviewError(
          payload.error || payload.details || 'Failed to approve delegation step.',
        )
        return
      }

      setLivePreviewWorkingText('Delegation approved. Loading next update')

      if (livePreviewRoutingRunId) {
        startLivePreview(livePreviewRoutingRunId)
      } else if (livePreviewLeadId) {
        startLiveDelegation(livePreviewLeadId)
      } else {
        void loadDocuments()
      }
    } catch (error) {
      setLivePreviewError(
        error instanceof Error
          ? error.message
          : 'Failed to approve delegation step.',
      )
    } finally {
      setApprovingDelegationStepId(null)
    }
  }

  useEffect(() => {
    if (!polling || !status?.documentId) return

    const timer = setInterval(() => {
      void pollStatus(status.documentId).catch((error: unknown) => {
        setPolling(false)
        setUploadError(
          error instanceof Error ? error.message : 'Status polling failed',
        )
      })
    }, 2_000)

    return () => clearInterval(timer)
  }, [polling, status?.documentId])

  useEffect(() => {
    if (!session || (role !== 'admin' && role !== 'synergy')) return
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
    if (!isLivePreviewing) {
      setLivePreviewDots(1)
      return
    }

    const timer = setInterval(() => {
      setLivePreviewDots((previous) => (previous >= 3 ? 1 : previous + 1))
    }, 450)

    return () => clearInterval(timer)
  }, [isLivePreviewing])

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    if (!status?.leadId || status.parseStatus !== 'NORMALIZED') return

    if (
      status.routing?.status === 'SKIPPED' &&
      status.routing.reason === 'Live routing pending.'
    ) {
      if (autoPreviewRunRef.current === `live:${status.leadId}`) return

      autoPreviewRunRef.current = `live:${status.leadId}`
      startLiveDelegation(status.leadId)
      return
    }

    const runId =
      status.routing?.status === 'COMPLETED'
        ? status.routing.routingRunId
        : undefined
    if (!runId) return

    if (autoPreviewRunRef.current === runId) return

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
      <main className="min-h-screen bg-slate-100 text-slate-900 px-6 py-6">
        <p className="text-slate-600">Checking session...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900 px-6 py-6">
        <p className="text-slate-600">
          You are not signed in.{' '}
          <Link to="/login" className="text-blue-600">
            Go to login
          </Link>
          .
        </p>
      </main>
    )
  }

  if (role !== 'admin' && role !== 'synergy') {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900 px-6 py-6">
        <p className="text-red-600">
          Forbidden. Admin or synergy role required.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 px-6 py-10">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600 shadow-xl shadow-blue-900/30 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Lead Document Intake
              </h1>
              <p className="text-slate-500 text-sm">
                Upload project lead files to trigger AI-powered extraction and
                routing
              </p>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column - 3 columns wide */}
          <div className="lg:col-span-3 space-y-6">
            {/* Top Row - Two Cards Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <UploadZone
                file={file}
                setFile={setFile}
                isUploading={isUploading}
                onUpload={uploadFile}
              />
              <FileSummary
                status={status}
                canRetry={canRetry}
                onRetry={retryExtraction}
                onStartPreview={() => {
                  if (status?.routing?.routingRunId) {
                    startLivePreview(status.routing.routingRunId)
                  } else if (status?.leadId) {
                    startLiveDelegation(status.leadId)
                  }
                }}
                isPreviewing={isLivePreviewing}
              />
            </div>

            {/* Upload Error */}
            {uploadError && (
              <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/10 shadow-sm shadow-red-900/10">
                <svg
                  className="w-5 h-5 text-red-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-red-700">{uploadError}</p>
              </div>
            )}

            {/* Bottom Row - File History Table */}
            <FileHistory
              documents={documents}
              isLoading={isDocumentsLoading}
              error={documentsError}
              onRefresh={loadDocuments}
              onReplay={startLivePreview}
            />
          </div>

          {/* Right Column - 2 columns wide */}
          <div className="lg:col-span-2">
            <SwarmChatPanel
              events={livePreviewEvents}
              isPreviewing={isLivePreviewing}
              workingText={livePreviewWorkingText}
              lastActivityAt={livePreviewLastActivityAt}
              dots={livePreviewDots}
              error={livePreviewError}
              leadId={livePreviewLeadId}
              routingRunId={livePreviewRoutingRunId}
              typingAgents={typingAgentIds}
              approvingStepId={approvingDelegationStepId}
              onApproveDelegationStep={approveDelegationStep}
              onOpenDelegationApprovals={openDelegationApprovals}
              onStop={stopLivePreview}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
