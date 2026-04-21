import { signIn, DEV_SIGNIN_ENABLED } from '@/auth'

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-novo-paper">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-novo-paper p-8 shadow-sm">
        <h1 className="mb-1 font-display text-2xl uppercase tracking-tight text-novo-ink">
          Novo Rewards
        </h1>
        {DEV_SIGNIN_ENABLED ? (
          <DevSignInForm />
        ) : (
          <GoogleSignInForm />
        )}
      </div>
    </main>
  )
}

function GoogleSignInForm() {
  return (
    <>
      <p className="mb-8 text-sm text-gray-500">
        Sign in with your Novo Google account.
      </p>
      <form
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/dashboard' })
        }}
      >
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </button>
      </form>
    </>
  )
}

function DevSignInForm() {
  return (
    <>
      <p className="mb-2 text-sm text-gray-500">
        Dev mode: sign in as any seeded Novo employee.
      </p>
      <p className="mb-6 text-xs text-gray-400">
        Try <code className="rounded bg-gray-100 px-1 py-0.5">flora@novo.co</code>,{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5">rares@novo.co</code>,{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5">sakshi@novo.co</code>
      </p>
      <form
        action={async (formData: FormData) => {
          'use server'
          const email = (formData.get('email') as string | null)?.trim() ?? ''
          await signIn('dev-email', { email, redirectTo: '/dashboard' })
        }}
      >
        <label className="block text-xs font-medium text-gray-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="flora@novo.co"
          className="mt-1 mb-4 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-novo-ink focus:outline-none"
        />
        <button
          type="submit"
          className="flex w-full items-center justify-center rounded-lg bg-novo-ink px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          Sign in (dev)
        </button>
      </form>
    </>
  )
}
