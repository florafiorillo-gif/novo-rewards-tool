'use client'

import { useEffect, useState, type FormEvent } from 'react'

// Lightweight demo-theater password gate to stop casual visitors hitting
// the Vercel testing deploy. Not real security — the expected values ship
// in the client bundle because they're NEXT_PUBLIC_* env vars. That's
// intentional for the demo use case.
//
// Bypass: if either env var is unset, the gate is disabled (so local dev
// and prod-without-a-configured-gate both work). Session is remembered in
// sessionStorage so a refresh doesn't re-prompt until the tab closes.

const STORAGE_KEY = 'novo-auth-gate'

type Status = 'checking' | 'locked' | 'unlocked'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const expectedUser = process.env.NEXT_PUBLIC_AUTH_USER
  const expectedPass = process.env.NEXT_PUBLIC_AUTH_PASS
  const gateEnabled = Boolean(expectedUser && expectedPass)

  const [status, setStatus] = useState<Status>(
    gateEnabled ? 'checking' : 'unlocked'
  )
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gateEnabled) return
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === 'ok') {
        setStatus('unlocked')
      } else {
        setStatus('locked')
      }
    } catch {
      setStatus('locked')
    }
  }, [gateEnabled])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (user === expectedUser && pass === expectedPass) {
      try {
        sessionStorage.setItem(STORAGE_KEY, 'ok')
      } catch {
        // Cookies/storage blocked — still unlock for this render.
      }
      setStatus('unlocked')
      setError(null)
    } else {
      setError('Incorrect username or password.')
    }
  }

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-novo-surface" />
    )
  }

  if (status === 'locked') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-novo-surface px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
              Novo Rewards
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-novo-ink">
              Testing preview
            </h1>
            <p className="mx-auto mt-2 max-w-xs text-sm text-novo-subtle">
              Enter the shared credentials to continue.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-3 rounded-xl border border-novo-border bg-novo-elevated p-8 shadow-card"
          >
            <div>
              <label
                htmlFor="auth-user"
                className="block text-xs font-medium text-novo-ink"
              >
                Username
              </label>
              <input
                id="auth-user"
                type="text"
                autoComplete="username"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                className="mt-1 block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink placeholder:text-novo-muted focus:border-novo-ink focus:outline-none"
                required
              />
            </div>
            <div>
              <label
                htmlFor="auth-pass"
                className="block text-xs font-medium text-novo-ink"
              >
                Password
              </label>
              <input
                id="auth-pass"
                type="password"
                autoComplete="current-password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className="mt-1 block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink placeholder:text-novo-muted focus:border-novo-ink focus:outline-none"
                required
              />
            </div>
            {error && <p className="text-xs text-novo-coral">{error}</p>}
            <button
              type="submit"
              className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-md bg-novo-ink px-4 text-sm font-medium text-novo-paper shadow-card transition hover:bg-novo-ink/90"
            >
              Continue
            </button>
          </form>
        </div>
      </main>
    )
  }

  return <>{children}</>
}
