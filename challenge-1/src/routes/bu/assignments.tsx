import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { authClient } from '@/lib/auth-client'

type BusinessUnitOption = {
  id: string
  code: string
  name: string
}

type AssignmentItem = {
  id: string
  status: 'APPROVED' | 'DISPATCHED' | 'BU_REJECTED'
  assignedRole: 'PRIMARY' | 'CROSS_SELL'
  approvedAt: string
  dispatchedAt: string | null
  buDecisionReason: string | null
  businessUnit: BusinessUnitOption
  lead: {
    id: string
    projectName: string | null
    locationText: string | null
    currentStatus?: string | null
  }
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
  artifacts: Array<{
    id: string
    artifactType: 'JSON' | 'PDF'
    createdAt: string
    downloadUrl: string
  }>
}

type AssignmentsResponse = {
  role: 'admin' | 'synergy' | 'bu_user'
  primaryBusinessUnitId: string | null
  assignments: AssignmentItem[]
  availableBusinessUnits: BusinessUnitOption[]
}

export const Route = createFileRoute('/bu/assignments')({
  component: BuAssignmentsPage,
})

function BuAssignmentsPage() {
  const { data: session, isPending } = authClient.useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<AssignmentsResponse | null>(null)
  const [filterBusinessUnitId, setFilterBusinessUnitId] = useState('')
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState<
    string | null
  >(null)

  async function loadAssignments() {
    setIsLoading(true)
    setError(null)

    try {
      const query = filterBusinessUnitId
        ? `?businessUnitId=${encodeURIComponent(filterBusinessUnitId)}`
        : ''
      const apiResponse = await fetch(`/api/bu/assignments${query}`)
      const payload = (await apiResponse.json()) as AssignmentsResponse & {
        error?: string
      }
      if (!apiResponse.ok) {
        setError(payload.error || 'Failed to load assignments.')
        return
      }
      setResponse(payload)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load assignments.',
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

    void loadAssignments()
  }, [session, filterBusinessUnitId])

  async function updateStatus(
    assignmentId: string,
    status: 'DISPATCHED' | 'BU_REJECTED',
    reason?: string,
  ) {
    setUpdatingAssignmentId(assignmentId)
    setError(null)

    try {
      const apiResponse = await fetch(
        `/api/bu/assignments/${assignmentId}/status`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status, reason }),
        },
      )
      const payload = (await apiResponse.json()) as { error?: string }
      if (!apiResponse.ok) {
        setError(payload.error || 'Failed to update status.')
        return
      }

      await loadAssignments()
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Failed to update status.',
      )
    } finally {
      setUpdatingAssignmentId(null)
    }
  }

  const assignments = useMemo(
    () => response?.assignments ?? [],
    [response?.assignments],
  )
  const role = response?.role
  const canFilterByBu = role === 'admin' || role === 'synergy'
  const availableBusinessUnits = response ? response.availableBusinessUnits : []

  if (isPending || isLoading) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white px-6 py-10">
        <p className="text-slate-600 dark:text-slate-300">
          Loading assignments...
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

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white px-6 py-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/60 backdrop-blur-sm p-6 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold mb-2">BU Assignments</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-2xl">
                View Synergy-approved opportunities and decide to accept or
                reject with reason.
              </p>
            </div>
          </div>

          {canFilterByBu ? (
            <div className="mt-6">
              <label
                className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300"
                htmlFor="bu-filter"
              >
                Filter by business unit
              </label>
              <select
                id="bu-filter"
                value={filterBusinessUnitId}
                onChange={(event) =>
                  setFilterBusinessUnitId(event.target.value)
                }
                className="w-full sm:w-auto min-w-[280px] appearance-none rounded-xl border border-slate-300 dark:border-slate-600/50 bg-slate-50 dark:bg-slate-900/70 px-4 py-2.5 pr-10 text-slate-900 dark:text-white shadow-sm dark:shadow-inner shadow-slate-200 dark:shadow-slate-950/20 focus:border-blue-500 dark:focus:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 cursor-pointer"
              >
                <option value="">All business units</option>
                {availableBusinessUnits.map((bu) => (
                  <option key={bu.id} value={bu.id}>
                    {bu.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 flex items-center gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 shadow-sm dark:shadow-amber-900/10">
              <span className="text-amber-700 dark:text-amber-300 text-sm">
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
                  <th className="px-4 py-4">BU</th>
                  <th className="px-4 py-4">Lead</th>
                  <th className="px-4 py-4">Role</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Approved</th>
                  <th className="px-4 py-4">BU Decision</th>
                  <th className="px-4 py-4">SKU Proposals</th>
                  <th className="px-4 py-4">Artifacts</th>
                  <th className="px-4 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700/30">
                {assignments.map((assignment) => (
                  <tr
                    key={assignment.id}
                    className="hover:bg-slate-100 dark:hover:bg-slate-700/30 transition-colors duration-150"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {assignment.id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {assignment.businessUnit.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500">
                        {assignment.businessUnit.code}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {assignment.lead.projectName || 'Untitled project'}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500">
                        {assignment.lead.locationText || 'Unknown location'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                          assignment.assignedRole === 'PRIMARY'
                            ? 'bg-blue-100 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300'
                            : 'bg-purple-100 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300'
                        }`}
                      >
                        {assignment.assignedRole}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {assignment.status === 'APPROVED' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-500/30 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                          Approved
                        </span>
                      )}
                      {assignment.status === 'DISPATCHED' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-blue-500/30 bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400" />
                          Dispatched
                        </span>
                      )}
                      {assignment.status === 'BU_REJECTED' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-red-500/30 bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400" />
                          Rejected
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(assignment.approvedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 max-w-[240px]">
                      {assignment.status === 'BU_REJECTED'
                        ? assignment.buDecisionReason || 'No reason provided'
                        : assignment.status === 'DISPATCHED'
                          ? 'Accepted by BU'
                          : '-'}
                    </td>
                    <td className="px-4 py-3 max-w-[340px]">
                      {assignment.skuProposals.length > 0 ? (
                        <ul className="space-y-1.5">
                          {assignment.skuProposals.map((sku) => (
                            <li
                              key={`${assignment.id}-${sku.buSku.id}`}
                              className="text-xs"
                            >
                              <span className="text-slate-500 dark:text-slate-500">
                                {sku.rank}.
                              </span>{' '}
                              <span className="font-medium text-slate-900 dark:text-white">
                                {sku.buSku.skuCode}
                              </span>{' '}
                              - {sku.buSku.skuName}
                              <span className="text-slate-400 dark:text-slate-600 ml-1">
                                ({sku.confidence.toFixed(4)})
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-500">
                          No SKU proposals
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {assignment.artifacts.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {assignment.artifacts.map((artifact) => (
                            <a
                              key={artifact.id}
                              href={artifact.downloadUrl}
                              className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 text-xs font-medium hover:underline transition-colors"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              {artifact.artifactType}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-500">
                          No artifacts
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {assignment.status === 'APPROVED' ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void updateStatus(assignment.id, 'DISPATCHED')
                            }
                            disabled={updatingAssignmentId === assignment.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-900/30 active:translate-y-px active:shadow-sm disabled:opacity-50 transition-all duration-200"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const reason = window.prompt(
                                'Reason for rejecting this assignment (minimum 5 characters)',
                              )
                              if (!reason) {
                                return
                              }
                              void updateStatus(
                                assignment.id,
                                'BU_REJECTED',
                                reason,
                              )
                            }}
                            disabled={updatingAssignmentId === assignment.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white shadow-md shadow-rose-900/20 hover:bg-rose-500 hover:shadow-lg hover:shadow-rose-900/30 active:translate-y-px active:shadow-sm disabled:opacity-50 transition-all duration-200"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-500">
                          No action
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-12 text-slate-500 dark:text-slate-400 text-center"
                      colSpan={10}
                    >
                      No assignments found.
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
