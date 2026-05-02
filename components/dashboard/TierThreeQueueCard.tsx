import { KeepViewLink } from '@/components/layout/KeepViewLink'

// Dedicated card for the Tier 3 committee queue. Surfaces total pending +
// urgent count so committee members can see at a glance whether anything
// needs same-day attention. The /committee/queue page is the full list
// with conflict + recusal handling; this card is the scan-signal.
//
// `disabled` renders the action button as a non-clickable muted control
// for users in a simulated view who don't actually hold committee role.
// Sim is for previewing dashboard shape; the click would otherwise 404
// against the real-role gate on /leadership/queue.
export function TierThreeQueueCard({
  total,
  urgent,
  disabled = false,
}: {
  total: number
  urgent: number
  disabled?: boolean
}) {
  const ctaLabel = total > 0 ? 'Review now' : 'Open queue'
  return (
    <section className="rounded-lg border border-novo-ink bg-novo-ink p-5 text-novo-paper shadow-elevated">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-white/60">
        Tier 3 decisions
      </p>
      <p className="mt-1 text-2xl font-semibold tabular">
        {total}
        <span className="ml-1 text-sm font-normal text-white/70">
          {total === 1 ? 'nomination' : 'nominations'}
        </span>
      </p>
      {urgent > 0 ? (
        <p className="mt-2 text-xs text-white/80">
          <span className="mr-1 inline-flex h-5 items-center rounded-full bg-novo-coral px-2 text-2xs font-medium text-white">
            {urgent} urgent
          </span>
          flagged for same-day review
        </p>
      ) : total > 0 ? (
        <p className="mt-2 text-xs text-white/70">Nothing urgent right now</p>
      ) : (
        <p className="mt-2 text-xs text-white/70">Queue is clear</p>
      )}
      {disabled ? (
        <button
          type="button"
          disabled
          title="Available in your real role only"
          className="mt-4 inline-flex h-8 cursor-not-allowed items-center rounded-md bg-white/40 px-3 text-xs font-medium text-novo-ink/60"
        >
          {ctaLabel} <span aria-hidden className="ml-1">→</span>
        </button>
      ) : (
        <KeepViewLink
          href="/leadership/queue"
          className="mt-4 inline-flex h-8 items-center rounded-md bg-white px-3 text-xs font-medium text-novo-ink hover:bg-white/90"
        >
          {ctaLabel} <span aria-hidden className="ml-1">→</span>
        </KeepViewLink>
      )}
    </section>
  )
}
