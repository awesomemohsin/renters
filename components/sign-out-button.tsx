'use client'

import { LogOut } from 'lucide-react'

export function SignOutButton({ className = '' }: { className?: string }) {
  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      window.location.href = '/login'
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 ${className}`}
    >
      <LogOut aria-hidden="true" className="size-3.5" />
      Sign out
    </button>
  )
}
