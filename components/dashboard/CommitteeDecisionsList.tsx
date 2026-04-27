import type { CommitteeDecisionRow } from '@/modules/dashboard/committee-view'
import type { CommitteeDecisionType } from '@/modules/committee/types'

interface Props {
  items: CommitteeDecisionRow[]
}

// Tier 3 decision log. The committee is the audience, so decision_log_text
// (free-form rationale per spec §7.5) is shown in full. Dollar amounts
// shown for 'approve' decisions — this is the committee's own scope, so
// spec §2 principle 2 doesn't gate it.
function chipStyle(decision: CommitteeDecisionType): { tone: string; label: string } {
  switch (decision) {
    case 'approve':
      return { tone: 'bg-green-50 text-green-700', label: 'Approved' }
    case 'deny':
      return { tone: 'bg-red-50 text-red-700', label: 'Returned to Tier 2' }
    case 'defer':
      return { tone: 'bg-amber-50 text-amber-800', label: 'Deferred' }
    default: {
      const _exhaustive: never = decision
      throw new Error(`unknown committee decision: ${String(_exhaustive)}`)
    }
  }
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

export function CommitteeDecisionsList({ items }: Props) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-medium text-gray-500">
        Committee decisions this quarter
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">
          No Tier 3 decisions logged this quarter yet. Once the committee
          approves, denies, or defers a Value Share nomination, it&rsquo;ll
          appear here with the rationale.
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map(({ decision, nominee }) => {
            const chip = chipStyle(decision.decision)
            return (
              <li
                key={decision.id}
                className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {nominee?.name ?? 'A teammate'}
                      {decision.approved_amount_usd != null && (
                        <span className="ml-2 text-xs text-gray-500">
                          {fmt(decision.approved_amount_usd)}
                          {decision.reward_form ? ` · ${decision.reward_form}` : ''}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(decision.decided_at).toLocaleDateString()}
                    </p>
                    {decision.decision_log_text && (
                      <p className="mt-2 text-sm text-gray-700">
                        {decision.decision_log_text}
                      </p>
                    )}
                    {decision.delivery_plan && (
                      <p className="mt-1 text-xs text-gray-600">
                        Delivery: {decision.delivery_plan}
                      </p>
                    )}
                  </div>
                  <span
                    className={
                      'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ' +
                      chip.tone
                    }
                  >
                    {chip.label}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
