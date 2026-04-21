import Link from 'next/link'
import type { HydratedNomination } from '@/modules/approvals/queries'
import {
  approveFromQueueAction,
  confirmRewardFromQueueAction,
  denyFromQueueAction,
  requestInfoFromQueueAction,
  upgradeFromQueueAction,
} from '@/app/approvals/queue/actions'

interface Props {
  hydrated: HydratedNomination
  viewerEmployeeId: string
}

export function ApprovalCard({ hydrated, viewerEmployeeId }: Props) {
  const {
    nomination,
    nominator,
    nominee,
    value,
    actions,
    action_needed,
    pending_reward,
  } = hydrated
  const tier = nomination.current_tier

  const approveActions = actions.filter((a) => a.action === 'approve')
  const deptApproved =
    nomination.tier2_dept_head_id &&
    approveActions.some((a) => a.actor_id === nomination.tier2_dept_head_id)
  const repApproved =
    nomination.tier2_people_team_rep_id &&
    approveActions.some(
      (a) => a.actor_id === nomination.tier2_people_team_rep_id
    )
  const viewerIsDeptHead =
    tier === 2 && nomination.tier2_dept_head_id === viewerEmployeeId
  const viewerIsRep =
    tier === 2 && nomination.tier2_people_team_rep_id === viewerEmployeeId
  const viewerAlreadyApproved = approveActions.some(
    (a) => a.actor_id === viewerEmployeeId
  )

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {nominator?.name ?? 'Someone'} recognized{' '}
            <span className="font-semibold">{nominee?.name ?? 'a teammate'}</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {value?.name ?? '—'} · submitted{' '}
            {new Date(nomination.submitted_at).toLocaleDateString()}
          </p>
        </div>
        {tier === 2 && (
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
            Tier 2 · two approvers required
          </span>
        )}
      </div>

      <section className="mb-4 space-y-3 rounded-md bg-gray-50 p-4 text-sm text-gray-700">
        <p className="italic">&ldquo;{nomination.behavior_text}&rdquo;</p>
        <p className="italic">&ldquo;{nomination.outcome_text}&rdquo;</p>
        {nomination.evidence_links.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-xs text-gray-500">
            {nomination.evidence_links.map((url) => (
              <li key={url}>
                <a href={url} className="underline" target="_blank" rel="noreferrer">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {tier === 2 && (
        <section className="mb-4 rounded-md border border-gray-200 p-3 text-xs text-gray-600">
          <p>
            <span className="font-medium text-gray-900">Department head:</span>{' '}
            {deptApproved ? '✓ approved' : 'waiting'}
          </p>
          <p className="mt-1">
            <span className="font-medium text-gray-900">People team rep:</span>{' '}
            {repApproved ? '✓ approved' : 'waiting'}
          </p>
          {(viewerIsDeptHead || viewerIsRep) && (
            <p className="mt-2 text-gray-500">
              You're reviewing as the{' '}
              {viewerIsDeptHead ? 'department head' : 'People team rep'}.
            </p>
          )}
        </section>
      )}

      {action_needed === 'select_reward' && (
        <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">
          Approved — pick a reward to finish.
        </p>
      )}
      {action_needed === 'confirm_reward' && pending_reward && (
        <p className="mb-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Dept head picked a {pending_reward.reward_type}
          {pending_reward.vendor ? ` from ${pending_reward.vendor}` : ''} · $
          {pending_reward.amount_usd.toLocaleString()} — confirm to commit budget.
        </p>
      )}
      {action_needed === 'wait' && (
        <p className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
          Waiting on the other approver.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {action_needed === 'select_reward' && (
          <Link
            href={`/approvals/${nomination.id}/reward`}
            className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Select reward
          </Link>
        )}
        {action_needed === 'confirm_reward' && pending_reward && (
          <form action={confirmRewardFromQueueAction}>
            <input type="hidden" name="reward_id" value={pending_reward.id} />
            <button
              type="submit"
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Confirm reward
            </button>
          </form>
        )}
        {action_needed === 'approve' && !viewerAlreadyApproved && (
          <form action={approveFromQueueAction}>
            <input type="hidden" name="nomination_id" value={nomination.id} />
            <button
              type="submit"
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Approve
            </button>
          </form>
        )}

        <details className="col-span-1 rounded-md border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            Deny
          </summary>
          <form action={denyFromQueueAction} className="mt-3 space-y-2">
            <input type="hidden" name="nomination_id" value={nomination.id} />
            <select
              name="reason_structured"
              defaultValue="other"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="failed_loophole">Failed the loophole test</option>
              <option value="value_mismatch">Value mismatch</option>
              <option value="already_recognized">Already recognized</option>
              <option value="insufficient_detail">Insufficient detail</option>
              <option value="other">Other</option>
            </select>
            <textarea
              name="reason_text"
              required
              rows={2}
              placeholder="A short reason the nominator will see"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Submit denial
            </button>
          </form>
        </details>

        <details className="col-span-1 rounded-md border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            {tier === 1 ? 'Propose upgrade' : 'Escalate to Tier 3'}
          </summary>
          <form action={upgradeFromQueueAction} className="mt-3 space-y-2">
            <input type="hidden" name="nomination_id" value={nomination.id} />
            {tier === 1 ? (
              <select
                name="to_tier"
                defaultValue="2"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="2">Tier 2 — Impact</option>
                <option value="3">Tier 3 — Value Share</option>
              </select>
            ) : (
              <input type="hidden" name="to_tier" value="3" />
            )}
            <textarea
              name="reasoning"
              required
              minLength={20}
              rows={3}
              placeholder="Why does this warrant the upgrade?"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" name="urgent" /> Mark urgent (Tier 3 only)
            </label>
            <button
              type="submit"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Send for review
            </button>
          </form>
        </details>

        <details className="col-span-1 rounded-md border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            Request more info
          </summary>
          <form action={requestInfoFromQueueAction} className="mt-3 space-y-2">
            <input type="hidden" name="nomination_id" value={nomination.id} />
            <textarea
              name="question"
              required
              rows={2}
              placeholder="What would help you decide?"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Send
            </button>
          </form>
        </details>
      </div>
    </article>
  )
}
