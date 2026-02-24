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
  const [editing, setEditing] = useState<
    Partial<Record<string, EditableUserState>>
  >({})

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
      const payload = (await response.json()) as UsersResponse & {
        error?: string
      }
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
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load users.',
      )
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
          primaryBusinessUnitId:
            createRole === 'bu_user'
              ? emptyStringToNull(createPrimaryBu)
              : null,
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
      setError(
        createError instanceof Error
          ? createError.message
          : 'Failed to create user.',
      )
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
        primaryBusinessUnitId:
          value.role === 'bu_user' ? value.primaryBusinessUnitId : null,
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
      <main className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center px-6">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </main>
    )
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center px-6">
        <p className="text-slate-600 dark:text-slate-300">
          You are not signed in.{' '}
          <Link
            to="/login"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 hover:underline transition-colors"
          >
            Go to login
          </Link>
          .
        </p>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 flex items-center justify-center">
            <span className="text-3xl">🔒</span>
          </div>
          <p className="text-red-600 dark:text-red-300">
            Forbidden. Admin role required.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white px-6 py-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/60 backdrop-blur-sm p-6 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50">
          <div>
            <h1 className="text-2xl font-semibold mb-2">User Management</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Create new users and manage their roles and business units.
            </p>
          </div>

          <form
            onSubmit={createUser}
            className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5 items-end"
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Name
              </label>
              <input
                placeholder="John Doe"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600/50 bg-slate-50 dark:bg-slate-900/70 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm dark:shadow-inner shadow-slate-200 dark:shadow-slate-950/20 focus:border-blue-500 dark:focus:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </label>
              <input
                type="email"
                placeholder="john@example.com"
                value={createEmail}
                onChange={(event) => setCreateEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600/50 bg-slate-50 dark:bg-slate-900/70 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm dark:shadow-inner shadow-slate-200 dark:shadow-slate-950/20 focus:border-blue-500 dark:focus:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600/50 bg-slate-50 dark:bg-slate-900/70 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm dark:shadow-inner shadow-slate-200 dark:shadow-slate-950/20 focus:border-blue-500 dark:focus:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Role
              </label>
              <select
                value={createRole}
                onChange={(event) =>
                  setCreateRole(event.target.value as AppRole)
                }
                className="w-full appearance-none rounded-xl border border-slate-300 dark:border-slate-600/50 bg-slate-50 dark:bg-slate-900/70 px-4 py-2.5 text-sm focus:border-blue-500 dark:focus:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 cursor-pointer"
              >
                <option value="bu_user">BU User</option>
                <option value="synergy">Synergy</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Primary BU
              </label>
              <select
                value={createPrimaryBu}
                onChange={(event) => setCreatePrimaryBu(event.target.value)}
                disabled={createRole !== 'bu_user'}
                className="w-full appearance-none rounded-xl border border-slate-300 dark:border-slate-600/50 bg-slate-50 dark:bg-slate-900/70 px-4 py-2.5 text-sm disabled:opacity-50 focus:border-blue-500 dark:focus:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 disabled:cursor-not-allowed cursor-pointer"
              >
                <option value="">Select BU</option>
                {businessUnits.map((bu) => (
                  <option key={bu.id} value={bu.id}>
                    {bu.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-5 pt-2">
              <button
                type="submit"
                disabled={isCreating}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-900/20 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-900/30 active:translate-y-px active:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg transition-all duration-200"
              >
                {isCreating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create User'
                )}
              </button>
            </div>
          </form>
          {error ? (
            <div className="mt-4 flex items-center gap-3 p-3 rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-500/10 shadow-sm dark:shadow-red-900/10">
              <span className="text-red-600 dark:text-red-300 text-sm">
                {error}
              </span>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/60 backdrop-blur-sm p-6 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 overflow-hidden">
          <h2 className="text-xl font-semibold mb-6">
            Users ({sortedUsers.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left border-b border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/80">
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                    Name
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                    Email
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                    Role
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                    Primary BU
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                    Created
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700/30">
                {sortedUsers.map((user) => {
                  const editor = editing[user.id] || {
                    role: user.role,
                    primaryBusinessUnitId: user.primaryBusinessUnitId,
                  }

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-100 dark:hover:bg-slate-700/30 transition-colors duration-150 align-top"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {user.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {user.email}
                      </td>
                      <td className="px-4 py-3">
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
                                  nextRole === 'bu_user'
                                    ? editor.primaryBusinessUnitId
                                    : null,
                              },
                            }))
                          }}
                          className="appearance-none rounded-lg border border-slate-300 dark:border-slate-600/50 bg-slate-50 dark:bg-slate-900/70 px-3 py-2 text-sm focus:border-blue-500 dark:focus:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 cursor-pointer"
                        >
                          <option value="bu_user">BU User</option>
                          <option value="synergy">Synergy</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={editor.primaryBusinessUnitId ?? ''}
                          disabled={editor.role !== 'bu_user'}
                          onChange={(event) =>
                            setEditing((current) => ({
                              ...current,
                              [user.id]: {
                                ...editor,
                                primaryBusinessUnitId: emptyStringToNull(
                                  event.target.value,
                                ),
                              },
                            }))
                          }
                          className="appearance-none rounded-lg border border-slate-300 dark:border-slate-600/50 bg-slate-50 dark:bg-slate-900/70 px-3 py-2 text-sm disabled:opacity-50 focus:border-blue-500 dark:focus:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <option value="">Select BU</option>
                          {businessUnits.map((bu) => (
                            <option key={bu.id} value={bu.id}>
                              {bu.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                        {new Date(user.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void saveUser(user.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-900/30 active:translate-y-px active:shadow-sm transition-all duration-200"
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
