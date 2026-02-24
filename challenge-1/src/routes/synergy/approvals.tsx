import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { authClient } from '@/lib/auth-client'

type ApprovalStatus =
  | 'PENDING_SYNERGY'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'BU_REJECTED'
  | 'CANCELED'
  | 'ALL'

type ApprovalItem = {
  id: string
  status:
    | 'PENDING_SYNERGY'
    | 'APPROVED'
    | 'DISPATCHED'
    | 'BU_REJECTED'
    | 'CANCELED'
  assignedRole: 'PRIMARY' | 'CROSS_SELL'
  approvedBy: string
  approvedAt: string
  dispatchedAt: string | null
  synergyDecisionReason: string | null
  buDecisionReason: string | null
  businessUnit: {
    id: string
    code: string
    name: string
  }
  lead: {
    id: string
    projectName: string | null
    locationText: string | null
    currentStatus: string
  }
  routingRecommendation: {
    id: string
    role: 'PRIMARY' | 'CROSS_SELL'
    finalScore: number
    confidence: number
    reasonSummary: string
    skuProposals: Array<{
      rank: number
      confidence: number
      rationale: string
      buSku: {
        id: string
        skuCode: string
        skuName: string
        skuCategory: string | null
      }
    }>
  }
  agentConversation: Array<{
    id: string
    agentId: string
    recipientId: string | null
    messageType: string
    content: string
    createdAt: string
  }>
  artifacts: Array<{
    id: string
    artifactType: 'JSON' | 'PDF'
    createdAt: string
    downloadUrl: string
  }>
}

type ApprovalsResponse = {
  statusFilter: ApprovalStatus
  assignments: ApprovalItem[]
}

export const Route = createFileRoute('/synergy/approvals')({
  component: SynergyApprovalsPage,
})

function SynergyApprovalsPage() {
  const { data: session, isPending } = authClient.useSession()
  const role = (session?.user as { role?: string } | undefined)?.role

  const [statusFilter, setStatusFilter] =
    useState<ApprovalStatus>('PENDING_SYNERGY')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<ApprovalsResponse | null>(null)
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState<
    string | null
  >(null)

  async function loadApprovals() {
    setIsLoading(true)
    setError(null)

    try {
      const query = `?status=${encodeURIComponent(statusFilter)}`
      const apiResponse = await fetch(`/api/synergy/approvals${query}`)
      const payload = (await apiResponse.json()) as ApprovalsResponse & {
        error?: string
      }
      if (!apiResponse.ok) {
        setError(payload.error || 'Failed to load approvals.')
        return
      }

      setResponse(payload)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load approvals.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!session) {
      setIsLoading(false)
      return
    }

    void loadApprovals()
  }, [session, statusFilter])

  async function updateStatus(
    assignmentId: string,
    nextStatus: 'APPROVED' | 'CANCELED',
    reason?: string,
  ) {
    setUpdatingAssignmentId(assignmentId)
    setError(null)

    try {
      const apiResponse = await fetch(
        `/api/synergy/approvals/${assignmentId}/status`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: nextStatus, reason }),
        },
      )

      const payload = (await apiResponse.json()) as {
        error?: string
        details?: string
      }
      if (!apiResponse.ok) {
        setError(
          payload.error || payload.details || 'Failed to update assignment.',
        )
        return
      }

      await loadApprovals()
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Failed to update assignment.',
      )
    } finally {
      setUpdatingAssignmentId(null)
    }
  }

  const assignments = useMemo(
    () => response?.assignments ?? [],
    [response?.assignments],
  )

  if (isPending || isLoading) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white px-6 py-10">
        <p className="text-slate-600 dark:text-slate-300">
          Loading Synergy approvals...
        </p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white px-6 py-10">
        <p className="text-slate-600 dark:text-slate-300">
          You are not signed in.{' '}
          <Link to="/login" className="text-blue-600 dark:text-blue-400">
            Go to login
          </Link>
          .
        </p>
      </main>
    )
  }

  if (role !== 'admin' && role !== 'synergy') {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white px-6 py-10">
        <p className="text-red-600 dark:text-rose-300">
          Forbidden. Admin or synergy role required.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white px-6 py-10">
      <div className="max-w-full mx-auto space-y-6">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/60 backdrop-blur-sm p-6 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold mb-2">
                Synergy Approval Gate
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-2xl">
                Review routing recommendations, then approve or reject before BU
                action.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
              htmlFor="status-filter"
            >
              Status filter
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as ApprovalStatus)
              }
              className="appearance-none rounded-xl border border-slate-300 dark:border-slate-600/50 bg-slate-50 dark:bg-slate-900/70 px-4 py-2.5 pr-10 text-sm focus:border-blue-500 dark:focus:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 cursor-pointer min-w-[180px]"
            >
              <option value="PENDING_SYNERGY">PENDING_SYNERGY</option>
              <option value="APPROVED">APPROVED</option>
              <option value="DISPATCHED">DISPATCHED</option>
              <option value="BU_REJECTED">BU_REJECTED</option>
              <option value="CANCELED">CANCELED</option>
              <option value="ALL">ALL</option>
            </select>
          </div>

          {error ? (
            <div className="mt-4 flex items-center gap-3 p-3 rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-500/10 shadow-sm dark:shadow-red-900/10">
              <span className="text-red-600 dark:text-red-300 text-sm">
                {error}
              </span>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/60 backdrop-blur-sm shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/80 text-left text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-4">Assignment</th>
                  <th className="px-4 py-4">Lead</th>
                  <th className="px-4 py-4">BU</th>
                  <th className="px-4 py-4">Recommendation</th>
                  <th className="px-4 py-4">SKU Proposals</th>
                  <th className="px-4 py-4">Decision Reason</th>
                  <th className="px-4 py-4">Artifacts</th>
                  <th className="px-4 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700/30">
                {assignments.map((assignment) => (
                  <tr
                    key={assignment.id}
                    className="hover:bg-slate-100 dark:hover:bg-slate-700/30 transition-colors duration-150 align-top"
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-slate-500">
                        {assignment.id}
                      </div>
                      <div className="mt-1">
                        {assignment.status === 'PENDING_SYNERGY' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border border-amber-500/30 bg-amber-500/10 text-amber-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Pending
                          </span>
                        )}
                        {assignment.status === 'APPROVED' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Approved
                          </span>
                        )}
                        {assignment.status === 'DISPATCHED' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border border-blue-500/30 bg-blue-500/10 text-blue-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            Dispatched
                          </span>
                        )}
                        {assignment.status === 'BU_REJECTED' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            BU Rejected
                          </span>
                        )}
                        {assignment.status === 'CANCELED' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border border-slate-500/30 bg-slate-500/10 text-slate-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                            Canceled
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {new Date(assignment.approvedAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {assignment.lead.projectName || 'Untitled project'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {assignment.lead.locationText || '-'}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {assignment.lead.currentStatus}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {assignment.businessUnit.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {assignment.businessUnit.code}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[340px]">
                      <div className="text-xs text-slate-600">
                        Score{' '}
                        <span className="font-mono font-medium text-slate-900">
                          {assignment.routingRecommendation.finalScore.toFixed(
                            4,
                          )}
                        </span>{' '}
                        | Confidence{' '}
                        <span className="font-mono font-medium text-slate-900">
                          {assignment.routingRecommendation.confidence.toFixed(
                            4,
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 mt-2 leading-relaxed">
                        {assignment.routingRecommendation.reasonSummary}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {assignment.routingRecommendation.skuProposals.length >
                      0 ? (
                        <ul className="space-y-1.5">
                          {assignment.routingRecommendation.skuProposals.map(
                            (sku) => (
                              <li
                                key={`${assignment.id}-${sku.buSku.id}`}
                                className="text-xs"
                              >
                                <span className="text-slate-500">
                                  {sku.rank}.
                                </span>{' '}
                                <span className="font-medium text-slate-900">
                                  {sku.buSku.skuCode}
                                </span>{' '}
                                - {sku.buSku.skuName}
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <span className="text-xs text-slate-500">
                          No SKU proposals
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 max-w-[240px]">
                      {assignment.status === 'CANCELED' ? (
                        assignment.synergyDecisionReason || 'No reason'
                      ) : assignment.status === 'BU_REJECTED' ? (
                        assignment.buDecisionReason || 'No reason'
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {assignment.artifacts.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {assignment.artifacts.map((artifact) => (
                            <a
                              key={artifact.id}
                              href={artifact.downloadUrl}
                              className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-600 text-xs font-medium hover:underline transition-colors"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              {artifact.artifactType}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          No artifacts
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {assignment.status === 'PENDING_SYNERGY' ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void updateStatus(assignment.id, 'APPROVED')
                            }
                            disabled={updatingAssignmentId === assignment.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-900/30 active:translate-y-px active:shadow-sm disabled:opacity-50 transition-all duration-200"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const reason = window.prompt(
                                'Reason for rejecting this assignment (optional)',
                              )
                              void updateStatus(
                                assignment.id,
                                'CANCELED',
                                reason || undefined,
                              )
                            }}
                            disabled={updatingAssignmentId === assignment.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white shadow-md shadow-rose-900/20 hover:bg-rose-500 hover:shadow-lg hover:shadow-rose-900/30 active:translate-y-px active:shadow-sm disabled:opacity-50 transition-all duration-200"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          No action
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-12 text-slate-500 text-center"
                      colSpan={8}
                    >
                      No assignments found for the selected filter.
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
