import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function getRouteByRole(
  role: string | undefined,
): '/admin/users' | '/synergy/approvals' | '/bu/assignments' {
  if (role === 'admin') {
    return '/admin/users'
  }

  if (role === 'synergy') {
    return '/synergy/approvals'
  }

  return '/bu/assignments'
}

export function LoginPage() {
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
    <main className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/60 backdrop-blur-sm p-8 shadow-2xl shadow-slate-200/50 dark:shadow-slate-900/50">
        <div className="text-center mb-8">
          
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">Welcome</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Sign in to access the Chin-Hin CRM workspace
          </p>
        </div>

        {isPending ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600/50 bg-white dark:bg-slate-900/70 px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm dark:shadow-inner shadow-slate-200 dark:shadow-slate-950/20 focus:border-blue-500 dark:focus:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600/50 bg-white dark:bg-slate-900/70 px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm dark:shadow-inner shadow-slate-200 dark:shadow-slate-950/20 focus:border-blue-500 dark:focus:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
            />
          </div>

          {error ? (
            <div className="flex items-start gap-3 p-3 rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-500/10 shadow-sm dark:shadow-red-900/10">
              <span className="text-red-600 dark:text-red-400 text-sm">{error}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-medium text-white shadow-lg shadow-blue-900/20 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-900/30 active:translate-y-px active:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg transition-all duration-200"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </section>
    </main>
  )
}
