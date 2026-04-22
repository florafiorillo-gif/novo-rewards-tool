import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getEmployeeById } from '@/modules/employees/service'
import { getNominationById } from '@/modules/nominations/service'
import { getValueById } from '@/modules/values/constants'
import { cancelNominationAction } from '../actions'
import { Card } from '@/components/ui/Card'
import { LinkButton } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000

export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const session = await auth()
  if (!session?.user?.employeeId) redirect('/auth/signin')

  const params = await searchParams
  const id = params.id
  if (!id) redirect('/nominations/new')

  const nomination = await getNominationById(id)
  if (!nomination || nomination.nominator_id !== session.user.employeeId) {
    redirect('/nominations/new')
  }

  const [nominee, value] = await Promise.all([
    getEmployeeById(nomination.nominee_id),
    Promise.resolve(getValueById(nomination.value_id)),
  ])

  const cancellable =
    nomination.status === 'submitted' &&
    Date.now() - nomination.submitted_at.getTime() < CANCEL_WINDOW_MS

  const firstName = nominee?.name?.split(' ')[0] ?? 'your teammate'

  return (
    <main className="mx-auto max-w-content px-6 py-16">
      <div className="text-center">
        {/* Confirmation mark — subtle, not a checkmark-balloon moment. */}
        <span
          aria-hidden
          className="mx-auto mb-6 flex h-10 w-10 items-center justify-center rounded-full border border-novo-border bg-novo-paper text-novo-ink"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
          Submitted
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-novo-ink">
          Thank you for noticing {firstName}.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-novo-subtle">
          Your nomination has been routed to the right approver. You&rsquo;ll
          get a note when it&rsquo;s been reviewed.
        </p>
      </div>

      <Card className="mt-10">
        <dl className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Row label="Recognizing">{nominee?.name ?? 'Unknown'}</Row>
          <Row label="Value">{value?.name ?? '—'}</Row>
          <Row label="Behavior">
            <span className="italic text-novo-ink">
              &ldquo;{nomination.behavior_text}&rdquo;
            </span>
          </Row>
          <Row label="Outcome">
            <span className="text-novo-ink">{nomination.outcome_text}</span>
          </Row>
          {nomination.evidence_links.length > 0 && (
            <Row label="Evidence">
              <ul className="space-y-1">
                {nomination.evidence_links.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      className="break-all text-xs text-novo-subtle underline underline-offset-2 hover:text-novo-ink"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </Row>
          )}
        </dl>
      </Card>

      {nomination.status === 'cancelled' && (
        <p className="mt-6 text-center text-sm text-novo-subtle">
          This nomination was cancelled.
        </p>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <LinkButton href="/dashboard" variant="primary" size="lg">
          Back to dashboard
        </LinkButton>
        <LinkButton href="/nominations/new" variant="secondary" size="lg">
          Recognize someone else
        </LinkButton>
        {cancellable && (
          <form action={cancelWithId.bind(null, nomination.id)}>
            <button
              type="submit"
              className="h-10 text-sm text-novo-subtle underline-offset-2 hover:text-novo-ink hover:underline"
            >
              Cancel this nomination
            </button>
          </form>
        )}
      </div>

      {cancellable && (
        <p className="mt-3 text-center text-xs text-novo-muted">
          You can cancel within 24 hours.
        </p>
      )}
    </main>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <>
      <dt className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
        {label}
      </dt>
      <dd className="text-sm text-novo-subtle">{children}</dd>
    </>
  )
}

async function cancelWithId(id: string) {
  'use server'
  await cancelNominationAction(id)
}
