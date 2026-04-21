import type { ExceptionRow } from '@/modules/dashboard/people-team-view'

interface Props {
  items: ExceptionRow[]
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

export function ProgramExceptionsList({ items }: Props) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-medium text-gray-500">
        Reserve draws this quarter
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">
          No reserve draws yet. Primary pools are absorbing demand.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map(({ exception, approver, nominee }) => (
            <li
              key={exception.id}
              className="flex items-start justify-between gap-4 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {fmt(exception.amount_usd)} for {nominee?.name ?? 'a teammate'}
                </p>
                <p className="text-xs text-gray-500">
                  Approved by {approver?.name ?? exception.approver_id} ·{' '}
                  {new Date(exception.created_at).toLocaleDateString()}
                </p>
                {exception.reason_text && (
                  <p className="mt-1 text-xs text-gray-600">
                    {exception.reason_text}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
