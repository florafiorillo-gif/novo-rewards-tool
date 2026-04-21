import type {
  RecipientRecognitionItem,
  RecipientRewardStatus,
} from '@/modules/dashboard/recipient-view'

interface Props {
  items: RecipientRecognitionItem[]
}

// Recipient-facing recognition history. Per spec §2 principle 1, no tier
// labels anywhere. Per spec §2 principle 2, no dollar amounts — the
// projected `reward` shape from recipient-view strips amounts server-side,
// so the component doesn't even have a path to render them.
function rewardChip(status: RecipientRewardStatus): { tone: string; label: string } {
  switch (status) {
    case 'delivered':
      return { tone: 'bg-green-50 text-green-700', label: 'Delivered' }
    case 'issued':
      return { tone: 'bg-blue-50 text-blue-800', label: 'On the way' }
    case 'pending_confirmation':
      return { tone: 'bg-amber-50 text-amber-800', label: 'Being finalized' }
    case 'pending_selection':
      return { tone: 'bg-gray-100 text-gray-600', label: 'Being arranged' }
    default: {
      const _exhaustive: never = status
      throw new Error(`unknown recipient status: ${String(_exhaustive)}`)
    }
  }
}

export function RecipientRecognitionList({ items }: Props) {
  if (items.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        No recognitions yet. When someone nominates you and it&rsquo;s
        approved, it&rsquo;ll show up here.
      </section>
    )
  }

  return (
    <section className="space-y-4">
      {items.map((item) => {
        const chip = item.reward ? rewardChip(item.reward.status) : null
        const dateShown = item.approved_at ?? item.submitted_at
        return (
          <article
            key={item.nomination_id}
            className="rounded-lg border border-gray-200 bg-white p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  From {item.nominator?.name ?? 'a teammate'}
                </p>
                <p className="text-xs text-gray-500">
                  {item.value?.name ?? '—'} ·{' '}
                  {new Date(dateShown).toLocaleDateString()}
                </p>
              </div>
              {chip && (
                <span
                  className={
                    'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ' +
                    chip.tone
                  }
                >
                  {chip.label}
                </span>
              )}
            </div>

            <p className="mt-4 text-sm text-gray-800">{item.behavior_text}</p>
            {item.outcome_text && (
              <p className="mt-2 text-sm text-gray-600">{item.outcome_text}</p>
            )}

            {item.reward?.scope_note_text && (
              <p className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
                {item.reward.scope_note_text}
              </p>
            )}
          </article>
        )
      })}
    </section>
  )
}
