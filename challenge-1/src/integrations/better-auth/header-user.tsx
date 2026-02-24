import { authClient } from '@/lib/auth-client'
import { Link, useNavigate } from '@tanstack/react-router'

export default function BetterAuthHeader() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()

  async function handleSignOut() {
    await authClient.signOut()
    // Use window.location.href to force a full navigation and clear all state
    window.location.href = '/login'
  }

  if (isPending) {
    return (
      <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700/50 animate-pulse rounded-xl" />
    )
  }

  if (session?.user) {
    const role = (session.user as { role?: string }).role || 'bu_user'

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {session.user.image ? (
            <img src={session.user.image} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/30">
              <span className="text-sm font-bold text-white">
                {session.user.name.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-900 dark:text-white">{session.user.name}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{session.user.email}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 text-xs rounded-lg bg-blue-100 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 uppercase font-semibold">
            {role}
          </span>
          <button
            onClick={() => void handleSignOut()}
            className="flex-1 h-9 px-4 text-sm font-medium rounded-xl bg-red-600 text-white shadow-lg shadow-red-900/20 hover:bg-red-500 hover:shadow-xl hover:shadow-red-900/30 active:translate-y-px transition-all duration-200"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <Link
      to="/login"
      className="h-10 px-4 text-sm font-medium rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 hover:shadow-xl hover:shadow-blue-900/30 active:translate-y-px transition-all duration-200 inline-flex items-center justify-center"
    >
      Sign in
    </Link>
  )
}
