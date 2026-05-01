import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getEmployeeById } from '@/modules/employees/service'
import {
  getNominationById,
  listGroupSiblings,
} from '@/modules/nominations/service'
import { getValueById } from '@/modules/values/constants'
import { cancelNominationAction } from '../actions'
import { Card } from '@/components/ui/Card'
import { LinkButton } from '@/components/ui/Button'
import type { NominationRecord } from '@/modules/nominations/types'

export const dynamic = 'force-dynamic'

const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000

// Confirmation page after a nomination submission.
//   ?id=<nom>     → single-recipient confirmation (legacy + 1-recipient
//                   group submissions both land here).
//   ?group=<grp>  → group-recognition confirmation listing every
//                   sibling and its individual approval status.
// Per the brief: "the nominator sees one consolidated 'your nomination
// was submitted for [4 people]' confirmation but can track each
// recipient's status separately."
export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; group?: string }>
}) {
  const session = await auth()
  if (!session?.user?.employeeId) redirect('/auth/signin')

  const params = await searchParams

  if (params.group) {
    return renderGroup(params.group, session.user.employeeId)
  }

  const id = params.id
  if (!id) redirect('/nominations/new')
  return renderSingle(id, session.user.employeeId)
}

// ─── Single recipient ──────────────────────────────────────────────────

async function renderSingle(id: string, sessionEmployeeId: string) {
  const nomination = await getNominationById(id)
  if (!nomination || nomination.nominator_id !== sessionEmployeeId) {
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
  // Peer recognitions post immediately at status='approved' with
  // current_tier=0 — there's no approver, no SLA, and nothing to cancel.
  const isPeer = nomination.current_tier === 0

  return (
    <main className="mx-auto max-w-content px-6 py-16">
      <ConfirmHeader
        title={`Thank you for noticing ${firstName}.`}
        subtitle={
          isPeer
            ? `Your peer recognition is live. ${firstName} will see it on their dashboard, and it'll show up in the recognition feed.`
            : "Your nomination has been routed to the right approver. You'll get a note when it's been reviewed."
        }
      />

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

      <FooterActions cancellable={cancellable} cancelTargetId={nomination.id} />
    </main>
  )
}

// ─── Group recognition ─────────────────────────────────────────────────

async function renderGroup(groupId: string, sessionEmployeeId: string) {
  const siblings = await listGroupSiblings(groupId)
  // Every row in a group has the same nominator. If the first row's
  // nominator doesn't match the viewer, the group either belongs to
  // someone else or doesn't exist — bounce.
  if (siblings.length === 0 || siblings[0]!.nominator_id !== sessionEmployeeId) {
    redirect('/nominations/new')
  }

  const headRow = siblings[0]!
  const value = getValueById(headRow.value_id)

  const nominees = await Promise.all(
    siblings.map((s) => getEmployeeById(s.nominee_id))
  )

  // Cancellation: each row is independent. The 24h window is set per
  // row; we render a per-row link for any row still in 'submitted'
  // status and within the window. Nothing collapses to a "cancel all"
  // — that's intentional, matching the spec ("each recipient still
  // gets their own private recipient DM with their individual reward
  // details" → each row is its own atom).
  const now = Date.now()

  return (
    <main className="mx-auto max-w-content px-6 py-16">
      <ConfirmHeader
        title={`Thank you for noticing ${siblings.length} teammates.`}
        subtitle="Each one routes to their own manager, and you can track each approval below."
      />

      <Card className="mt-10">
        <dl className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Row label="Recognizing">
            <ul className="space-y-1">
              {siblings.map((s, i) => {
                const emp = nominees[i]
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span className="text-novo-ink">{emp?.name ?? 'Unknown'}</span>
                    <StatusChip nomination={s} />
                  </li>
                )
              })}
            </ul>
          </Row>
          <Row label="Value">{value?.name ?? '—'}</Row>
          <Row label="Behavior">
            <span className="italic text-novo-ink">
              &ldquo;{headRow.behavior_text}&rdquo;
            </span>
          </Row>
          <Row label="Outcome">
            <span className="text-novo-ink">{headRow.outcome_text}</span>
          </Row>
          {headRow.evidence_links.length > 0 && (
            <Row label="Evidence">
              <ul className="space-y-1">
                {headRow.evidence_links.map((url) => (
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

      <p className="mt-6 text-center text-xs text-novo-muted">
        Each recipient&rsquo;s manager approves independently. If one denies,
        only that recipient drops off — the others continue.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <LinkButton href="/dashboard" variant="primary" size="lg">
          Back to dashboard
        </LinkButton>
        <LinkButton href="/nominations/new" variant="secondary" size="lg">
          Recognize someone else
        </LinkButton>
      </div>

      <CancelGroupSection siblings={siblings} now={now} />
    </main>
  )
}

function CancelGroupSection({
  siblings,
  now,
}: {
  siblings: NominationRecord[]
  now: number
}) {
  const cancellable = siblings.filter(
    (s) =>
      s.status === 'submitted' &&
      now - s.submitted_at.getTime() < CANCEL_WINDOW_MS
  )
  if (cancellable.length === 0) return null

  return (
    <div className="mt-8 rounded-lg border border-novo-border bg-novo-hover/40 p-4 text-xs text-novo-subtle">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
        Cancel within 24 hours
      </p>
      <ul className="mt-2 space-y-1">
        {cancellable.map((s) => (
          <li key={s.id}>
            <form action={cancelOne.bind(null, s.id)} className="inline">
              <button
                type="submit"
                className="underline underline-offset-2 hover:text-novo-ink"
              >
                Cancel for nomination {s.id.slice(0, 12)}…
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Shared bits ────────────────────────────────────────────────────

function ConfirmHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="text-center">
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
        {title}
      </h1>
      <p
        className="mx-auto mt-3 max-w-md text-sm text-novo-subtle"
        dangerouslySetInnerHTML={{ __html: subtitle }}
      />
    </div>
  )
}

function FooterActions({
  cancellable,
  cancelTargetId,
}: {
  cancellable: boolean
  cancelTargetId: string
}) {
  return (
    <>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <LinkButton href="/dashboard" variant="primary" size="lg">
          Back to dashboard
        </LinkButton>
        <LinkButton href="/nominations/new" variant="secondary" size="lg">
          Recognize someone else
        </LinkButton>
        {cancellable && (
          <form action={cancelOne.bind(null, cancelTargetId)}>
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
    </>
  )
}

function StatusChip({ nomination }: { nomination: NominationRecord }) {
  const map: Record<
    NominationRecord['status'],
    { label: string; tone: string }
  > = {
    submitted: {
      label: 'Awaiting approval',
      tone: 'border-novo-border bg-novo-surface text-novo-subtle',
    },
    under_review: {
      label: 'Under review',
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
    },
    approved: {
      label: 'Approved',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    },
    fulfilled: {
      label: 'Fulfilled',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    },
    denied: {
      label: 'Denied',
      tone: 'border-amber-200 bg-amber-50 text-amber-900',
    },
    cancelled: {
      label: 'Cancelled',
      tone: 'border-novo-border bg-novo-hover text-novo-muted',
    },
  }
  const { label, tone } = map[nomination.status]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium ${tone}`}
    >
      {label}
    </span>
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

async function cancelOne(id: string) {
  'use server'
  await cancelNominationAction(id)
}
