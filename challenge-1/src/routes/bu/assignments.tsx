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
  status: 'APPROVED' | 'DISPATCHED' | 'CANCELED'
  assignedRole: 'PRIMARY' | 'CROSS_SELL'
  approvedAt: string
  dispatchedAt: string | null
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
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState<string | null>(null)

  async function loadAssignments() {
    setIsLoading(true)
    setError(null)

    try {
      const query = filterBusinessUnitId
        ? `?businessUnitId=${encodeURIComponent(filterBusinessUnitId)}`
        : ''
      const apiResponse = await fetch(`/api/bu/assignments${query}`)
      const payload = (await apiResponse.json()) as AssignmentsResponse & { error?: string }
      if (!apiResponse.ok) {
        setError(payload.error || 'Failed to load assignments.')
        return
      }
      setResponse(payload)
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Failed to load assignments.',
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
    status: 'DISPATCHED' | 'CANCELED',
  ) {
    setUpdatingAssignmentId(assignmentId)
    setError(null)

    try {
      const apiResponse = await fetch(`/api/bu/assignments/${assignmentId}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const payload = (await apiResponse.json()) as { error?: string }
      if (!apiResponse.ok) {
        setError(payload.error || 'Failed to update status.')
        return
      }

      await loadAssignments()
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : 'Failed to update status.',
      )
    } finally {
      setUpdatingAssignmentId(null)
    }
  }

  const assignments = useMemo(() => response?.assignments ?? [], [response?.assignments])
  const role = response?.role
  const canFilterByBu = role === 'admin' || role === 'synergy'
  const availableBusinessUnits = response ? response.availableBusinessUnits : []

  if (isPending || isLoading) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 px-6 py-10">
        <p className="text-slate-300">Loading assignments...</p>
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

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 px-6 py-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl">
          <h1 className="text-2xl font-semibold mb-2">BU Assignments</h1>
          <p className="text-slate-300 text-sm">
            View assigned opportunities and update dispatch status for your BU workflow.
          </p>
          {canFilterByBu ? (
            <div className="mt-4">
              <label className="block text-sm mb-1 text-slate-300" htmlFor="bu-filter">
                Filter by business unit
              </label>
              <select
                id="bu-filter"
                value={filterBusinessUnitId}
                onChange={(event) => setFilterBusinessUnitId(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm min-w-[260px]"
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
          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-slate-300">
                <th className="pb-2 pr-3">Assignment</th>
                <th className="pb-2 pr-3">BU</th>
                <th className="pb-2 pr-3">Lead</th>
                <th className="pb-2 pr-3">Role</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Approved</th>
                <th className="pb-2 pr-3">SKU Proposals</th>
                <th className="pb-2 pr-3">Artifacts</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id} className="border-b border-slate-800">
                  <td className="py-2 pr-3 font-mono text-xs">{assignment.id}</td>
                  <td className="py-2 pr-3">
                    {assignment.businessUnit.name}
                    <div className="text-xs text-slate-400">{assignment.businessUnit.code}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <div>{assignment.lead.projectName || 'Untitled project'}</div>
                    <div className="text-xs text-slate-400">
                      {assignment.lead.locationText || 'Unknown location'}
                    </div>
                  </td>
                  <td className="py-2 pr-3">{assignment.assignedRole}</td>
                  <td className="py-2 pr-3">{assignment.status}</td>
                  <td className="py-2 pr-3">{new Date(assignment.approvedAt).toLocaleString()}</td>
                  <td className="py-2 pr-3 max-w-[340px]">
                    {assignment.skuProposals.length > 0 ? (
                      <ul className="space-y-1">
                        {assignment.skuProposals.map((sku) => (
                          <li key={`${assignment.id}-${sku.buSku.id}`} className="text-xs">
                            <span className="text-slate-400">{sku.rank}.</span> {sku.buSku.skuCode} -{' '}
                            {sku.buSku.skuName}
                            <span className="text-slate-500">
                              {' '}
                              ({sku.confidence.toFixed(4)})
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-slate-400">No SKU proposals</span>
                    )}
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
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void updateStatus(assignment.id, 'DISPATCHED')}
                        disabled={updatingAssignmentId === assignment.id}
                        className="rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 px-3 py-1"
                      >
                        Dispatch
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateStatus(assignment.id, 'CANCELED')}
                        disabled={updatingAssignmentId === assignment.id}
                        className="rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-60 px-3 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {assignments.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={9}>
                    No assignments found.
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
