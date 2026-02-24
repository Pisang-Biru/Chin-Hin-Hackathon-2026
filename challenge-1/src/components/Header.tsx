import { Link } from '@tanstack/react-router'

import BetterAuthHeader from '../integrations/better-auth/header-user.tsx'
import { authClient } from '@/lib/auth-client'

import { useState } from 'react'
import {
  BriefcaseBusiness,
  CheckSquare,
  FileUp,
  Home,
  Menu,
  ShieldUser,
  X,
} from 'lucide-react'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const { data: session } = authClient.useSession()
  const role = (session?.user as { role?: string } | undefined)?.role

  const showLeadUpload = role === 'admin' || role === 'synergy'
  const showAdminUsers = role === 'admin'
  const showBuAssignments = role === 'admin' || role === 'synergy' || role === 'bu_user'
  const showSynergyApprovals = role === 'admin' || role === 'synergy'

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl shadow-lg shadow-slate-900/40">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button
              onClick={() => setIsOpen(true)}
              className="group inline-flex items-center justify-center p-2.5 rounded-xl hover:bg-slate-700/50 text-slate-300 hover:text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              aria-label="Open menu"
            >
              <Menu size={22} className="transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110" />
            </button>
            <h1 className="ml-4 text-lg font-bold">
              <Link to="/" className="flex items-center gap-2">
                <span className="text-blue-400">
                  Chin-Hin
                </span>
                <span className="text-white/90">CRM</span>
              </Link>
            </h1>
          </div>
        </div>
      </header>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-40 animate-in fade-in duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-slate-800/95 backdrop-blur-xl text-white shadow-2xl shadow-slate-900/60 z-50 transform transition-all duration-300 ease-in-out flex flex-col border-r border-border ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-slate-800/80">
          <div className="ml-4 text-lg font-bold">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-blue-400">
                Chin-Hin
              </span>
              <span className="text-white/90">CRM</span>
            </Link>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="group inline-flex items-center justify-center p-2 rounded-xl hover:bg-slate-700/50 text-slate-400 hover:text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            aria-label="Close menu"
          >
            <X size={20} className="transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-5 overflow-y-auto space-y-2">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="group flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
            activeProps={{
              className:
                'group flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 shadow-lg shadow-blue-900/30 text-white',
            }}
          >
            <Home size={20} className="transition-all duration-200 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
            <span className="font-medium">Home</span>
          </Link>

          {showLeadUpload ? (
            <Link
              to="/leads/upload"
              onClick={() => setIsOpen(false)}
              className="group flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
              activeProps={{
                className:
                  'group flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 shadow-lg shadow-blue-900/30 text-white',
              }}
            >
              <FileUp size={20} className="transition-all duration-200 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
              <span className="font-medium">Lead Upload</span>
            </Link>
          ) : null}
          {showAdminUsers ? (
            <Link
              to="/admin/users"
              onClick={() => setIsOpen(false)}
              className="group flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
              activeProps={{
                className:
                  'group flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 shadow-lg shadow-blue-900/30 text-white',
              }}
            >
              <ShieldUser size={20} className="transition-all duration-200 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
              <span className="font-medium">Users</span>
            </Link>
          ) : null}
          {showBuAssignments ? (
            <Link
              to="/bu/assignments"
              onClick={() => setIsOpen(false)}
              className="group flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
              activeProps={{
                className:
                  'group flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 shadow-lg shadow-blue-900/30 text-white',
              }}
            >
              <BriefcaseBusiness size={20} className="transition-all duration-200 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
              <span className="font-medium">BU Assignments</span>
            </Link>
          ) : null}
          {showSynergyApprovals ? (
            <Link
              to="/synergy/approvals"
              onClick={() => setIsOpen(false)}
              className="group flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
              activeProps={{
                className:
                  'group flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 shadow-lg shadow-blue-900/30 text-white',
              }}
            >
              <CheckSquare size={20} className="transition-all duration-200 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
              <span className="font-medium">Synergy Approvals</span>
            </Link>
          ) : null}
        </nav>

        <div className="p-4 border-t border-border bg-slate-800/80 shadow-lg shadow-slate-900/30">
          <BetterAuthHeader />
        </div>
      </aside>
    </>
  )
}
