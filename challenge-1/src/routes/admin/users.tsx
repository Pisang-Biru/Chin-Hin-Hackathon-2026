import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { authClient } from '@/lib/auth-client'

type AppRole = 'admin' | 'synergy' | 'bu_user'

type BusinessUnitOption = {
  id: string
  code: string
  name: string
}

type UserItem = {
  id: string
  email: string
  name: string
  role: AppRole
  primaryBusinessUnitId: string | null
  primaryBusinessUnit: BusinessUnitOption | null
  createdAt: string
}

type UsersResponse = {
  users: UserItem[]
  businessUnits: BusinessUnitOption[]
}

type EditableUserState = {
  role: AppRole
  primaryBusinessUnitId: string | null
}

export const Route = createFileRoute('/admin/users')({
  component: AdminUsersPage,
})

function emptyStringToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function AdminUsersPage() {
  const { data: session, isPending } = authClient.useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = role === 'admin'

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<UserItem[]>([])
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([])
  const [editing, setEditing] = useState<Partial<Record<string, EditableUserState>>>({})

  const [createEmail, setCreateEmail] = useState('')
  const [createName, setCreateName] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createRole, setCreateRole] = useState<AppRole>('bu_user')
  const [createPrimaryBu, setCreatePrimaryBu] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const sortedUsers = useMemo(() => [...users], [users])

  async function loadUsers() {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/users')
      const payload = (await response.json()) as UsersResponse & { error?: string }
      if (!response.ok) {
        setError(payload.error || 'Failed to load users.')
        return
      }

      setUsers(payload.users)
      setBusinessUnits(payload.businessUnits)
      setEditing(
        Object.fromEntries(
          payload.users.map((user) => [
            user.id,
            {
              role: user.role,
              primaryBusinessUnitId: user.primaryBusinessUnitId,
            },
          ]),
        ),
      )
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load users.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false)
      return
    }

    void loadUsers()
  }, [isAdmin])

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setIsCreating(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: createEmail,
          name: createName,
          password: createPassword,
          role: createRole,
          primaryBusinessUnitId: createRole === 'bu_user' ? emptyStringToNull(createPrimaryBu) : null,
        }),
      })
      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setError(payload.error || 'Failed to create user.')
        return
      }

      setCreateEmail('')
      setCreateName('')
      setCreatePassword('')
      setCreateRole('bu_user')
      setCreatePrimaryBu('')
      await loadUsers()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create user.')
    } finally {
      setIsCreating(false)
    }
  }

  async function saveUser(userId: string) {
    const value = editing[userId]
    if (!value) {
      return
    }

    setError(null)

    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        role: value.role,
        primaryBusinessUnitId: value.role === 'bu_user' ? value.primaryBusinessUnitId : null,
      }),
    })
    const payload = (await response.json()) as { error?: string }
    if (!response.ok) {
      setError(payload.error || 'Failed to update user.')
      return
    }

    await loadUsers()
  }

  if (isPending || isLoading) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 px-6 py-10">
        <p className="text-slate-300">Loading...</p>
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

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 px-6 py-10">
        <p className="text-red-300">Forbidden. Admin role required.</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 px-6 py-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl">
          <h1 className="text-2xl font-semibold mb-4">User Management</h1>
          <form onSubmit={createUser} className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <input
              placeholder="Name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={createEmail}
              onChange={(event) => setCreateEmail(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
              required
            />
            <input
              type="password"
              placeholder="Temporary password"
              value={createPassword}
              onChange={(event) => setCreatePassword(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
              required
            />
            <select
              value={createRole}
              onChange={(event) => setCreateRole(event.target.value as AppRole)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="bu_user">BU User</option>
              <option value="synergy">Synergy</option>
              <option value="admin">Admin</option>
            </select>
            <select
              value={createPrimaryBu}
              onChange={(event) => setCreatePrimaryBu(event.target.value)}
              disabled={createRole !== 'bu_user'}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="">Select BU</option>
              {businessUnits.map((bu) => (
                <option key={bu.id} value={bu.id}>
                  {bu.name}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={isCreating}
              className="lg:col-span-5 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 px-4 py-2 text-sm font-medium"
            >
              {isCreating ? 'Creating...' : 'Create User'}
            </button>
          </form>
          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-xl overflow-x-auto">
          <h2 className="text-xl font-semibold mb-4">Users</h2>
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-slate-300 border-b border-slate-700">
                <th className="pb-2 pr-3">Name</th>
                <th className="pb-2 pr-3">Email</th>
                <th className="pb-2 pr-3">Role</th>
                <th className="pb-2 pr-3">Primary BU</th>
                <th className="pb-2 pr-3">Created</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => {
                const editor = editing[user.id] || {
                  role: user.role,
                  primaryBusinessUnitId: user.primaryBusinessUnitId,
                }

                return (
                  <tr key={user.id} className="border-b border-slate-800 align-top">
                    <td className="py-2 pr-3">{user.name}</td>
                    <td className="py-2 pr-3">{user.email}</td>
                    <td className="py-2 pr-3">
                      <select
                        value={editor.role}
                        onChange={(event) => {
                          const nextRole = event.target.value as AppRole
                          setEditing((current) => ({
                            ...current,
                            [user.id]: {
                              ...editor,
                              role: nextRole,
                              primaryBusinessUnitId:
                                nextRole === 'bu_user' ? editor.primaryBusinessUnitId : null,
                            },
                          }))
                        }}
                        className="rounded border border-slate-600 bg-slate-900 px-2 py-1"
                      >
                        <option value="bu_user">BU User</option>
                        <option value="synergy">Synergy</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={editor.primaryBusinessUnitId ?? ''}
                        disabled={editor.role !== 'bu_user'}
                        onChange={(event) =>
                          setEditing((current) => ({
                            ...current,
                            [user.id]: {
                              ...editor,
                              primaryBusinessUnitId: emptyStringToNull(event.target.value),
                            },
                          }))
                        }
                        className="rounded border border-slate-600 bg-slate-900 px-2 py-1 disabled:opacity-60"
                      >
                        <option value="">Select BU</option>
                        {businessUnits.map((bu) => (
                          <option key={bu.id} value={bu.id}>
                            {bu.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">{new Date(user.createdAt).toLocaleString()}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => void saveUser(user.id)}
                        className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  )
}
