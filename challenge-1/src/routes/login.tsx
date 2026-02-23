import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function getRouteByRole(role: string | undefined): '/admin/users' | '/leads/upload' | '/bu/assignments' {
  if (role === 'admin') {
    return '/admin/users'
  }

  if (role === 'synergy') {
    return '/leads/upload'
  }

  return '/bu/assignments'
}

function LoginPage() {
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) {
      return
    }

    const role = (session.user as { role?: string }).role
    void navigate({ to: getRouteByRole(role) })
  }, [navigate, session?.user])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setIsSubmitting(true)
    setError(null)

    try {
      const result = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
      })

      if (result.error) {
        setError(result.error.message || 'Invalid credentials.')
        return
      }

      const role = (result.data.user as { role?: string }).role
      await navigate({ to: getRouteByRole(role) })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Login failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 px-6 py-14">
      <section className="max-w-md mx-auto rounded-2xl border border-slate-700 bg-slate-800/80 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold mb-2">Sign In</h1>
        <p className="text-slate-300 mb-6 text-sm">
          Use your admin-provisioned account to access the BU CRM workspace.
        </p>

        {isPending ? <p className="text-slate-400 text-sm">Checking session...</p> : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm text-slate-200" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-200" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
            />
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 px-4 py-2 font-medium"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </section>
    </main>
  )
}
