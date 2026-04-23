import type { TeamRhythmView } from '@/modules/dashboard/manager-view'

// Per-report recognition cadence over a rolling window. Managers use this
// to catch "nobody's recognized Alex in a month" before it becomes an
// engagement problem. The composer sorts never-recognized first, so the
// top rows are always the ones that need attention.
export function TeamRhythmCard({ view }: { view: TeamRhythmView }) {
  if (view.entries.length === 0) return null

  return (
    <section className="rounded-lg border border-novo-border bg-novo-elevated p-5 shadow-card">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
        Team rhythm
      </p>
      <p className="mt-1 text-xs text-novo-subtle">
        Recognition across your team · last {view.window_days} days
      </p>
      <ul className="mt-3 divide-y divide-novo-border">
        {view.entries.map((entry) => (
          <li
            key={entry.report.id}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-novo-ink">
                {entry.report.name}
              </p>
              <p className="mt-0.5 truncate text-2xs text-novo-muted">
                {describeLast(entry.last_recognized_at)}
              </p>
            </div>
            <CountPill count={entry.count_in_window} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function describeLast(last: Date | null): string {
  if (!last) return 'Not recognized in this window'
  const days = Math.max(
    0,
    Math.floor((Date.now() - last.getTime()) / (24 * 60 * 60 * 1000))
  )
  if (days === 0) return 'Recognized today'
  if (days === 1) return 'Recognized 1 day ago'
  return `Recognized ${days} days ago`
}

function CountPill({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="inline-flex h-6 items-center rounded-full border border-amber-200 bg-amber-50 px-2 text-2xs font-medium text-amber-900 tabular">
        0
      </span>
    )
  }
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-novo-border bg-novo-surface px-2 text-2xs font-medium text-novo-subtle tabular">
      {count}
    </span>
  )
}
