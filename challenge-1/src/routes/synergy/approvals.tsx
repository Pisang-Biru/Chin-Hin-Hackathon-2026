import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { authClient } from '@/lib/auth-client'
import { getAgentAvatar } from '@/lib/swarm/agent-avatar'

type ApprovalStatus =
  | 'PENDING_SYNERGY'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'BU_REJECTED'
  | 'CANCELED'
  | 'ALL'

type ApprovalItem = {
  id: string
  status: 'PENDING_SYNERGY' | 'APPROVED' | 'DISPATCHED' | 'BU_REJECTED' | 'CANCELED'
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

function toAgentLabel(agentId: string): string {
  return getAgentAvatar(agentId).label
}

function SynergyApprovalsPage() {
  const { data: session, isPending } = authClient.useSession()
  const role = (session?.user as { role?: string } | undefined)?.role

  const [statusFilter, setStatusFilter] = useState<ApprovalStatus>('PENDING_SYNERGY')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<ApprovalsResponse | null>(null)
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState<string | null>(null)

  async function loadApprovals() {
    setIsLoading(true)
    setError(null)

    try {
      const query = `?status=${encodeURIComponent(statusFilter)}`
      const apiResponse = await fetch(`/api/synergy/approvals${query}`)
      const payload = (await apiResponse.json()) as ApprovalsResponse & { error?: string }
      if (!apiResponse.ok) {
        setError(payload.error || 'Failed to load approvals.')
        return
      }

      setResponse(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load approvals.')
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
      const apiResponse = await fetch(`/api/synergy/approvals/${assignmentId}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, reason }),
      })

      const payload = (await apiResponse.json()) as { error?: string; details?: string }
      if (!apiResponse.ok) {
        setError(payload.error || payload.details || 'Failed to update assignment.')
        return
      }

      await loadApprovals()
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : 'Failed to update assignment.',
      )
    } finally {
      setUpdatingAssignmentId(null)
    }
  }

  const assignments = useMemo(() => response?.assignments ?? [], [response?.assignments])

  if (isPending || isLoading) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 px-6 py-10">
        <p className="text-slate-300">Loading Synergy approvals...</p>
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
      <div className="max-w-7xl mx-auto space-y-6">
        <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl space-y-4">
          <div>
            <h1 className="text-2xl font-semibold mb-2">Synergy Approval Gate</h1>
            <p className="text-slate-300 text-sm">
              Review routing recommendations, then approve or reject before BU action.
            </p>
          </div>

          <div className="flex gap-3 items-center">
            <label className="text-sm text-slate-300" htmlFor="status-filter">
              Status filter
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ApprovalStatus)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="PENDING_SYNERGY">PENDING_SYNERGY</option>
              <option value="APPROVED">APPROVED</option>
              <option value="DISPATCHED">DISPATCHED</option>
              <option value="BU_REJECTED">BU_REJECTED</option>
              <option value="CANCELED">CANCELED</option>
              <option value="ALL">ALL</option>
            </select>
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl overflow-x-auto">
          <table className="w-full min-w-[1300px] text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-slate-300">
                <th className="pb-2 pr-3">Assignment</th>
                <th className="pb-2 pr-3">Lead</th>
                <th className="pb-2 pr-3">BU</th>
                <th className="pb-2 pr-3">Recommendation</th>
                <th className="pb-2 pr-3">SKU Proposals</th>
                <th className="pb-2 pr-3">Agent Conversation</th>
                <th className="pb-2 pr-3">Decision Reason</th>
                <th className="pb-2 pr-3">Artifacts</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id} className="border-b border-slate-800 align-top">
                  <td className="py-2 pr-3">
                    <div className="font-mono text-xs">{assignment.id}</div>
                    <div>{assignment.status}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(assignment.approvedAt).toLocaleString()}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <div>{assignment.lead.projectName || 'Untitled project'}</div>
                    <div className="text-xs text-slate-400">{assignment.lead.locationText || '-'}</div>
                    <div className="text-xs text-slate-500">{assignment.lead.currentStatus}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <div>{assignment.businessUnit.name}</div>
                    <div className="text-xs text-slate-400">{assignment.businessUnit.code}</div>
                  </td>
                  <td className="py-2 pr-3 max-w-[330px]">
                    <div className="text-xs text-slate-300">
                      Score {assignment.routingRecommendation.finalScore.toFixed(4)} | Confidence{' '}
                      {assignment.routingRecommendation.confidence.toFixed(4)}
                    </div>
                    <p className="text-xs text-slate-200 mt-1">
                      {assignment.routingRecommendation.reasonSummary}
                    </p>
                  </td>
                  <td className="py-2 pr-3">
                    {assignment.routingRecommendation.skuProposals.length > 0 ? (
                      <ul className="space-y-1">
                        {assignment.routingRecommendation.skuProposals.map((sku) => (
                          <li key={`${assignment.id}-${sku.buSku.id}`} className="text-xs">
                            <span className="text-slate-400">{sku.rank}.</span> {sku.buSku.skuCode} -{' '}
                            {sku.buSku.skuName}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-slate-400">No SKU proposals</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 max-w-[360px]">
                    {assignment.agentConversation.length > 0 ? (
                      <details className="rounded border border-slate-700 bg-slate-900/70 p-2">
                        <summary className="cursor-pointer text-xs text-cyan-300">
                          View {assignment.agentConversation.length} messages
                        </summary>
                        <div className="mt-2 space-y-2">
                          {assignment.agentConversation.map((message) => (
                            <article
                              key={message.id}
                              className="rounded border border-slate-700 bg-slate-800 px-2 py-1"
                            >
                              <div className="flex items-center gap-2">
                                <img
                                  src={getAgentAvatar(message.agentId).imagePath}
                                  alt={toAgentLabel(message.agentId)}
                                  className="h-7 w-7 rounded-md border border-slate-600"
                                />
                                {message.recipientId ? (
                                  <>
                                    <span className="text-slate-400">{'->'}</span>
                                    <img
                                      src={getAgentAvatar(message.recipientId).imagePath}
                                      alt={toAgentLabel(message.recipientId)}
                                      className="h-7 w-7 rounded-md border border-slate-600"
                                    />
                                  </>
                                ) : null}
                                <p className="text-[11px] text-cyan-200">
                                  {toAgentLabel(message.agentId)}
                                  {message.recipientId ? ` -> ${toAgentLabel(message.recipientId)}` : ''}
                                </p>
                              </div>
                              <p className="text-[11px] text-slate-300">
                                {new Date(message.createdAt).toLocaleString()} | {message.messageType}
                              </p>
                              <p className="text-xs text-slate-100 mt-1">{message.content}</p>
                            </article>
                          ))}
                        </div>
                      </details>
                    ) : (
                      <span className="text-xs text-slate-400">No conversation logs</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-300 max-w-[220px]">
                    {assignment.status === 'CANCELED'
                      ? assignment.synergyDecisionReason || 'No reason'
                      : assignment.status === 'BU_REJECTED'
                        ? assignment.buDecisionReason || 'No reason'
                        : '-'}
                  </td>
                  <td className="py-2 pr-3">
                    {assignment.artifacts.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {assignment.artifacts.map((artifact) => (
                          <a
                            key={artifact.id}
                            href={artifact.downloadUrl}
                            className="text-cyan-300 hover:text-cyan-200 text-xs"
                          >
                            {artifact.artifactType}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No artifacts</span>
                    )}
                  </td>
                  <td className="py-2">
                    {assignment.status === 'PENDING_SYNERGY' ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void updateStatus(assignment.id, 'APPROVED')}
                          disabled={updatingAssignmentId === assignment.id}
                          className="rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 px-3 py-1"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const reason = window.prompt('Reason for rejecting this assignment (optional)')
                            void updateStatus(assignment.id, 'CANCELED', reason || undefined)
                          }}
                          disabled={updatingAssignmentId === assignment.id}
                          className="rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-60 px-3 py-1"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No action</span>
                    )}
                  </td>
                </tr>
              ))}
              {assignments.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={9}>
                    No assignments found for the selected filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  )
}
