import Link from 'next/link'

// Small two-number card showing the viewer's own recognition activity —
// given (that they wrote) vs. received (that teammates wrote about them).
// Links to /dashboard/me for the full received history; given history is
// not a dedicated surface yet (nominations the viewer submitted appear in
// /nominations/submitted indirectly, but that's a submit-flow confirmation,
// not a history view).
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
      {received > 0 && (
        <Link
          href="/dashboard/me"
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-novo-ink hover:opacity-80"
        >
          View what teammates noticed <span aria-hidden>→</span>
        </Link>
      )}
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
