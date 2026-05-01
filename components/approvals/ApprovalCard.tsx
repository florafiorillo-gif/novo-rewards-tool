import type { HydratedNomination } from '@/modules/approvals/queries'
import { KeepViewLink } from '@/components/layout/KeepViewLink'
import {
  approveFromQueueAction,
  confirmRewardFromQueueAction,
  denyFromQueueAction,
  requestInfoFromQueueAction,
  upgradeFromQueueAction,
} from '@/app/review/actions'
import { valueTagClasses } from '@/modules/values/constants'
import { Button } from '@/components/ui/Button'

interface Props {
  hydrated: HydratedNomination
  viewerEmployeeId: string
}

// Dense scannable row for the approvals queue. Stripe-style: identity +
// context left, timestamp in the middle, CTA right. Destructive + upgrade
// + request-info paths collapse into disclosure rows below the primary
// CTA so they don't steal weight from the common happy path.
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
    <article className="rounded-lg border border-novo-border bg-novo-elevated shadow-card">
      {/* ── Row header: identity + meta + primary action ─────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-2xs text-novo-muted">
            <TierChip tier={tier} />
            {value && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${valueTagClasses(value.id)}`}
              >
                {value.name}
              </span>
            )}
            <span className="tabular">{submittedAgo(nomination.submitted_at)}</span>
          </div>
          <p className="mt-2 text-sm text-novo-subtle">
            <span className="font-medium text-novo-ink">
              {nominator?.name ?? 'Someone'}
            </span>{' '}
            recognized{' '}
            <span className="font-medium text-novo-ink">
              {nominee?.name ?? 'a teammate'}
            </span>
          </p>
          <p className="mt-2 text-[15px] leading-6 text-novo-ink">
            &ldquo;{nomination.behavior_text}&rdquo;
          </p>
          <p className="mt-1 text-sm text-novo-subtle">
            {nomination.outcome_text}
          </p>
          {nomination.evidence_links.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-novo-subtle">
              {nomination.evidence_links.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-novo-ink"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span aria-hidden>↗</span>
                    {shortenUrl(url)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <PrimaryAction
            action_needed={action_needed}
            nominationId={nomination.id}
            pendingRewardId={pending_reward?.id}
            viewerAlreadyApproved={viewerAlreadyApproved}
          />
        </div>
      </div>

      {/* ── Tier 2 two-approver sub-status ───────────────────────────── */}
      {tier === 2 && (
        <div className="flex items-center gap-4 border-t border-novo-border bg-novo-surface/60 px-5 py-2.5 text-xs text-novo-subtle">
          <ApproverDot label="Dept head" done={!!deptApproved} />
          <ApproverDot label="People team rep" done={!!repApproved} />
          {(viewerIsDeptHead || viewerIsRep) && (
            <span className="ml-auto text-2xs text-novo-muted">
              Reviewing as the{' '}
              {viewerIsDeptHead ? 'department head' : 'People team rep'}
            </span>
          )}
        </div>
      )}

      {/* ── State banner for non-approve actions ─────────────────────── */}
      {action_needed === 'confirm_reward' && pending_reward && (
        <div className="border-t border-novo-border bg-novo-hover/60 px-5 py-3 text-xs text-novo-subtle">
          <span className="font-medium text-novo-ink">Dept head picked</span> a{' '}
          {pending_reward.reward_type}
          {pending_reward.vendor ? ` from ${pending_reward.vendor}` : ''}, $
          <span className="tabular">
            {pending_reward.amount_usd.toLocaleString()}
          </span>{' '}
          — confirm to commit budget.
        </div>
      )}
      {action_needed === 'wait' && (
        <div className="border-t border-novo-border bg-novo-hover/60 px-5 py-3 text-xs text-novo-subtle">
          Waiting on the other approver.
        </div>
      )}

      {/* ── Secondary actions: deny / upgrade / request-info ─────────── */}
      {action_needed === 'approve' && !viewerAlreadyApproved && (
        <div className="grid gap-2 border-t border-novo-border p-4 sm:grid-cols-3">
          <DenyDisclosure nominationId={nomination.id} />
          <UpgradeDisclosure
            nominationId={nomination.id}
            fromTier={tier as 1 | 2}
          />
          <RequestInfoDisclosure nominationId={nomination.id} />
        </div>
      )}
    </article>
  )
}

// ─── Subcomponents ───────────────────────────────────────────────────────

function PrimaryAction({
  action_needed,
  nominationId,
  pendingRewardId,
  viewerAlreadyApproved,
}: {
  action_needed: HydratedNomination['action_needed']
  nominationId: string
  pendingRewardId: string | undefined
  viewerAlreadyApproved: boolean
}) {
  if (action_needed === 'select_reward') {
    return (
      <KeepViewLink
        href={`/approvals/${nominationId}/reward`}
        className="inline-flex h-9 items-center justify-center rounded-md bg-novo-coral px-4 text-sm font-medium text-novo-paper hover:bg-novo-coral/90"
      >
        Select reward
      </KeepViewLink>
    )
  }
  if (action_needed === 'confirm_reward' && pendingRewardId) {
    return (
      <form action={confirmRewardFromQueueAction}>
        <input type="hidden" name="reward_id" value={pendingRewardId} />
        <Button type="submit" size="md">
          Confirm reward
        </Button>
      </form>
    )
  }
  if (action_needed === 'approve' && !viewerAlreadyApproved) {
    return (
      <form action={approveFromQueueAction}>
        <input type="hidden" name="nomination_id" value={nominationId} />
        <Button type="submit" size="md">
          Approve
        </Button>
      </form>
    )
  }
  if (action_needed === 'approve' && viewerAlreadyApproved) {
    return (
      <span className="inline-flex h-9 items-center rounded-md border border-novo-border bg-novo-hover px-3 text-xs text-novo-subtle">
        You approved
      </span>
    )
  }
  return null
}

function TierChip({ tier }: { tier: number }) {
  const label = tier === 1 ? 'Tier 1' : tier === 2 ? 'Tier 2' : 'Tier 3'
  const hint =
    tier === 2
      ? '· two approvers required'
      : tier === 3
        ? '· committee'
        : '· manager approval'
  return (
    <span className="inline-flex items-center gap-1 rounded border border-novo-border bg-novo-surface px-1.5 py-0.5 font-medium text-novo-subtle">
      {label}
      <span className="text-novo-muted">{hint}</span>
    </span>
  )
}

function ApproverDot({ label, done }: { label: string; done: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${
          done ? 'bg-emerald-500' : 'bg-novo-border-strong'
        }`}
      />
      <span className={done ? 'text-novo-ink' : 'text-novo-subtle'}>
        {label}
        {done ? ' · approved' : ' · waiting'}
      </span>
    </span>
  )
}

function DenyDisclosure({ nominationId }: { nominationId: string }) {
  return (
    <details className="rounded-md border border-novo-border bg-novo-paper">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-novo-subtle hover:text-novo-ink">
        Deny
      </summary>
      <form action={denyFromQueueAction} className="space-y-2 px-3 pb-3">
        <input type="hidden" name="nomination_id" value={nominationId} />
        <select
          name="reason_structured"
          defaultValue="other"
          className="block h-9 w-full rounded-md border border-novo-border bg-novo-paper px-2 text-xs text-novo-ink focus:border-novo-ink"
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
          className="block w-full rounded-md border border-novo-border bg-novo-paper px-2 py-1.5 text-xs text-novo-ink focus:border-novo-ink"
        />
        <Button type="submit" variant="secondary" size="sm" className="w-full">
          Submit denial
        </Button>
      </form>
    </details>
  )
}

function UpgradeDisclosure({
  nominationId,
  fromTier,
}: {
  nominationId: string
  fromTier: 1 | 2
}) {
  return (
    <details className="rounded-md border border-novo-border bg-novo-paper">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-novo-subtle hover:text-novo-ink">
        {fromTier === 1 ? 'Propose upgrade' : 'Escalate to Tier 3'}
      </summary>
      <form action={upgradeFromQueueAction} className="space-y-2 px-3 pb-3">
        <input type="hidden" name="nomination_id" value={nominationId} />
        {fromTier === 1 ? (
          <select
            name="to_tier"
            defaultValue="2"
            className="block h-9 w-full rounded-md border border-novo-border bg-novo-paper px-2 text-xs text-novo-ink focus:border-novo-ink"
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
          className="block w-full rounded-md border border-novo-border bg-novo-paper px-2 py-1.5 text-xs text-novo-ink focus:border-novo-ink"
        />
        <label className="flex items-center gap-2 text-xs text-novo-subtle">
          <input type="checkbox" name="urgent" /> Mark urgent (Tier 3 only)
        </label>
        <Button type="submit" variant="secondary" size="sm" className="w-full">
          Send for review
        </Button>
      </form>
    </details>
  )
}

function RequestInfoDisclosure({ nominationId }: { nominationId: string }) {
  return (
    <details className="rounded-md border border-novo-border bg-novo-paper">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-novo-subtle hover:text-novo-ink">
        Ask the nominator
      </summary>
      <form
        action={requestInfoFromQueueAction}
        className="space-y-2 px-3 pb-3"
      >
        <input type="hidden" name="nomination_id" value={nominationId} />
        <textarea
          name="question"
          required
          rows={2}
          placeholder="What would help you decide?"
          className="block w-full rounded-md border border-novo-border bg-novo-paper px-2 py-1.5 text-xs text-novo-ink focus:border-novo-ink"
        />
        <Button type="submit" variant="secondary" size="sm" className="w-full">
          Send
        </Button>
      </form>
    </details>
  )
}

function submittedAgo(at: Date): string {
  const ms = Date.now() - new Date(at).getTime()
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins}m pending`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h pending`
  const days = Math.round(hrs / 24)
  return `${days}d pending`
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, '')}${
      u.pathname === '/' ? '' : u.pathname
    }`.slice(0, 60)
  } catch {
    return url.slice(0, 60)
  }
}
