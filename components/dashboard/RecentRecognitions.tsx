import type { RecentRecognitionItem } from '@/modules/dashboard/manager-view'

interface Props {
  items: RecentRecognitionItem[]
}

export function RecentRecognitions({ items }: Props) {
  if (items.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-500">
        You haven&rsquo;t approved any recognitions yet this quarter. When you
        do, they&rsquo;ll show up here.
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-medium text-gray-500">Recent recognitions you approved</h2>
      <ul className="space-y-3">
        {items.map(({ nomination, nominee, value, approved_at }) => (
          <li
            key={nomination.id}
            className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">
                {nominee?.name ?? 'A teammate'}
              </p>
              <p className="text-xs text-gray-500">
                {value?.name ?? '—'} · {new Date(approved_at).toLocaleDateString()}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
