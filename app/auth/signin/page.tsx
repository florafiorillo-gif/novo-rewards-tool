import { signIn, DEV_SIGNIN_ENABLED } from '@/auth'
import { Button } from '@/components/ui/Button'

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center px-6 py-12">
      <div className="w-full">
        <div className="mb-8 text-center">
          <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
            Novo Rewards
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-novo-ink">
            Sign in
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-novo-subtle">
            Recognize the work happening around you. Route the right rewards to
            the right people.
          </p>
        </div>

        <div className="rounded-xl border border-novo-border bg-novo-elevated p-8 shadow-card">
          {DEV_SIGNIN_ENABLED ? <DevSignInForm /> : <GoogleSignInForm />}
        </div>

        {DEV_SIGNIN_ENABLED && (
          <p className="mt-6 text-center text-2xs uppercase tracking-[0.08em] text-novo-muted">
            Development mode
          </p>
        )}
      </div>
    </main>
  )
}

function GoogleSignInForm() {
  return (
    <>
      <p className="mb-6 text-sm text-novo-subtle">
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
          className="flex w-full items-center justify-center gap-3 rounded-md border border-novo-border bg-novo-paper px-4 py-2.5 text-sm font-medium text-novo-ink shadow-card transition hover:bg-novo-hover"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
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
      <p className="mb-1 text-sm text-novo-ink">
        Sign in as any seeded Novo employee.
      </p>
      <p className="mb-5 text-xs text-novo-subtle">
        Try{' '}
        <code className="rounded border border-novo-border bg-novo-hover px-1 py-0.5 text-2xs text-novo-ink">
          cat@novo.co
        </code>
        ,{' '}
        <code className="rounded border border-novo-border bg-novo-hover px-1 py-0.5 text-2xs text-novo-ink">
          dog@novo.co
        </code>
        , or{' '}
        <code className="rounded border border-novo-border bg-novo-hover px-1 py-0.5 text-2xs text-novo-ink">
          owl@novo.co
        </code>
        .
      </p>
      <form
        action={async (formData: FormData) => {
          'use server'
          const email = (formData.get('email') as string | null)?.trim() ?? ''
          await signIn('dev-email', { email, redirectTo: '/dashboard' })
        }}
        className="space-y-3"
      >
        <div>
          <label
            className="block text-xs font-medium text-novo-ink"
            htmlFor="email"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="cat@novo.co"
            className="mt-1 block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink placeholder:text-novo-muted focus:border-novo-ink"
          />
        </div>
        <Button type="submit" size="lg" className="w-full">
          Sign in
        </Button>
      </form>
    </>
  )
}
