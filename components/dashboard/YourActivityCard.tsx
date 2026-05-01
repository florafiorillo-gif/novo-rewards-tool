import { KeepViewLink } from '@/components/layout/KeepViewLink'

// Small two-number card showing the viewer's own recognition activity —
// given (that they wrote) vs. received (that teammates wrote about them).
// Always links to /dashboard/me so the card is a reliable entry point
// to the full personal history regardless of whether the viewer has
// received anything yet. Two testers couldn't find /dashboard/me from
// the avatar dropdown alone, so the dashboard now surfaces it twice:
// in primary nav and from this card.
export function YourActivityCard({
  given,
  received,
}: {
  given: number
  received: number
}) {
  return (
    <section className="rounded-lg border border-novo-border bg-novo-elevated p-5 shadow-card">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
        Your recognitions
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-4">
        <Stat label="Given" value={given} />
        <Stat label="Received" value={received} />
      </dl>
      <KeepViewLink
        href="/dashboard/me"
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-novo-ink hover:opacity-80"
      >
        {received > 0 ? 'View what teammates noticed' : 'See your history'}{' '}
        <span aria-hidden>→</span>
      </KeepViewLink>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold text-novo-ink tabular">
        {value}
      </dd>
    </div>
  )
}
