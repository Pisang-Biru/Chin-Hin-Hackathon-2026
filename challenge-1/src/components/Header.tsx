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
  const showBuAssignments =
    role === 'admin' || role === 'synergy' || role === 'bu_user'
  const showSynergyApprovals = role === 'admin' || role === 'synergy'

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 backdrop-blur-xl shadow-sm shadow-slate-200/80">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button
              onClick={() => setIsOpen(true)}
              className="group inline-flex items-center justify-center p-2.5 rounded-xl hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-label="Open menu"
            >
              <Menu
                size={22}
                className="transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110"
              />
            </button>
            <h1 className="ml-4 text-lg font-bold">
              <Link to="/" className="flex items-center gap-2">
                <span className="text-blue-700">Chin-Hin</span>
                <span className="text-slate-800">CRM</span>
              </Link>
            </h1>
          </div>
        </div>
      </header>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 animate-in fade-in duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-slate-50/95 backdrop-blur-xl text-slate-900 shadow-2xl shadow-slate-300/60 z-50 transform transition-all duration-300 ease-in-out flex flex-col border-r border-slate-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="ml-4 text-lg font-bold">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-blue-700">Chin-Hin</span>
              <span className="text-slate-800">CRM</span>
            </Link>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="group inline-flex items-center justify-center p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-label="Close menu"
          >
            <X
              size={20}
              className="transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110"
            />
          </button>
        </div>

        <nav className="flex-1 px-4 py-5 overflow-y-auto space-y-2">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="group flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-all duration-200"
            activeProps={{
              className:
                'group flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 shadow-md shadow-blue-200 text-white',
            }}
          >
            <Home
              size={20}
              className="transition-all duration-200 group-hover:scale-110 group-hover:text-blue-700"
            />
            <span className="font-medium">Home</span>
          </Link>

          {showLeadUpload ? (
            <Link
              to="/leads/upload"
              onClick={() => setIsOpen(false)}
              className="group flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-all duration-200"
              activeProps={{
                className:
                  'group flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 shadow-md shadow-blue-200 text-white',
              }}
            >
              <FileUp
                size={20}
                className="transition-all duration-200 group-hover:scale-110 group-hover:text-blue-700"
              />
              <span className="font-medium">Lead Upload</span>
            </Link>
          ) : null}
          {showAdminUsers ? (
            <Link
              to="/admin/users"
              onClick={() => setIsOpen(false)}
              className="group flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-all duration-200"
              activeProps={{
                className:
                  'group flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 shadow-md shadow-blue-200 text-white',
              }}
            >
              <ShieldUser
                size={20}
                className="transition-all duration-200 group-hover:scale-110 group-hover:text-blue-700"
              />
              <span className="font-medium">Users</span>
            </Link>
          ) : null}
          {showBuAssignments ? (
            <Link
              to="/bu/assignments"
              onClick={() => setIsOpen(false)}
              className="group flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-all duration-200"
              activeProps={{
                className:
                  'group flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 shadow-md shadow-blue-200 text-white',
              }}
            >
              <BriefcaseBusiness
                size={20}
                className="transition-all duration-200 group-hover:scale-110 group-hover:text-blue-700"
              />
              <span className="font-medium">BU Assignments</span>
            </Link>
          ) : null}
          {showSynergyApprovals ? (
            <Link
              to="/synergy/approvals"
              onClick={() => setIsOpen(false)}
              className="group flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-all duration-200"
              activeProps={{
                className:
                  'group flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 shadow-md shadow-blue-200 text-white',
              }}
            >
              <CheckSquare
                size={20}
                className="transition-all duration-200 group-hover:scale-110 group-hover:text-blue-700"
              />
              <span className="font-medium">Synergy Approvals</span>
            </Link>
          ) : null}
        </nav>

        <div className="p-4 border-t border-slate-200 bg-slate-50/80 shadow-sm shadow-slate-200/80">
          <BetterAuthHeader />
        </div>
      </aside>
    </>
  )
}
