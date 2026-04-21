import type { SlaMissRow } from '@/modules/dashboard/people-team-view'

interface Props {
  items: SlaMissRow[]
}

// SLA miss surface. Spec §7.6 auto-deny uses the system actor, which means
// the nominator didn't hear back; the People team is supposed to notice
// and reach out. Escalations (7-day) are a soft nudge — less urgent but
// still worth visibility. Tier is omitted from the UI copy per spec §2.
export function SlaMissesList({ items }: Props) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-medium text-gray-500">
        Stalled nominations this quarter
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">
          No SLA escalations or auto-denies this quarter. Nice.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map(({ miss, nominator, nominee, value }) => (
            <li
              key={`${miss.nomination.id}-${miss.kind}`}
              className="flex items-start justify-between gap-4 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {nominator?.name ?? 'Someone'} → {nominee?.name ?? 'a teammate'}
                </p>
                <p className="text-xs text-gray-500">
                  {value?.name ?? '—'} ·{' '}
                  {miss.kind === 'auto_denied'
                    ? 'Auto-denied after 21 days'
                    : 'Escalated at 7 days'}{' '}
                  · {new Date(miss.event_at).toLocaleDateString()}
                </p>
              </div>
              <span
                className={
                  'rounded-full px-3 py-1 text-xs font-medium ' +
                  (miss.kind === 'auto_denied'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-amber-50 text-amber-800')
                }
              >
                {miss.kind === 'auto_denied' ? 'Auto-denied' : 'Escalated'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
