'use client'

import { Suspense, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building2, Eye, EyeOff, Lock, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const destination = searchParams.get('from') || '/'

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage('')

    if (!password) {
      setErrorMessage('Please enter your administrator password.')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        })

        const data = await res.json()

        if (!res.ok) {
          setErrorMessage(data.error || 'Authentication failed. Please check your credentials.')
          return
        }

        // Successfully logged in
        router.push(destination)
        router.refresh()
      } catch {
        setErrorMessage('Unable to connect to authentication service. Please try again.')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Sign in to workspace</h2>
        <p className="mt-1 text-xs text-slate-500">
          Enter your building administrator password to access rooms, residents, and financials.
        </p>
      </div>

      {errorMessage && (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs text-rose-800">
          <ShieldAlert aria-hidden="true" className="size-4 shrink-0 text-rose-600" />
          <p className="leading-5">{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleLogin} className="mt-6 space-y-4">
        <div>
          <label htmlFor="admin-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
            Administrator Password
          </label>
          <div className="relative mt-2">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Lock aria-hidden="true" className="size-4" />
            </div>
            <input
              id="admin-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter administrator password"
              className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-950 focus:outline-none focus:ring-1 focus:ring-slate-950"
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="mt-2 w-full rounded-xl bg-slate-950 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? 'Verifying credentials...' : 'Sign in to workspace'}
        </Button>
      </form>

      <div className="mt-6 border-t border-slate-100 pt-5 text-center">
        <p className="text-[11px] leading-5 text-slate-400">
          Single-tenant property manager access. All actions are logged and protected.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f6f8fb] px-4 py-12 text-slate-950 sm:px-6">
      <div className="w-full max-w-md">
        {/* Header branding */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
            <Building2 aria-hidden="true" className="size-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">Renters</h1>
          <p className="mt-1 text-sm text-slate-500">Property desk private workspace</p>
        </div>

        {/* Suspense boundary for useSearchParams */}
        <Suspense fallback={
          <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white p-8">
            <p className="text-sm text-slate-400">Loading sign-in desk...</p>
          </div>
        }>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
