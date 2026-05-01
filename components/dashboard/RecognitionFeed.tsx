import type { RecognitionFeedItem } from '@/modules/dashboard/recognition-feed'
import { EmptyState } from '@/components/ui/EmptyState'
import { KeepViewLink } from '@/components/layout/KeepViewLink'
import { valueTagClasses } from '@/modules/values/constants'

interface Props {
  items: RecognitionFeedItem[]
  /** The viewer's employee id — used to render "you" on self-referential rows. */
  viewerId: string
}

export function RecognitionFeed({ items, viewerId }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No recognitions yet"
        description="When someone on Novo calls out a teammate for living one of the four values, it lands here. Be the first to notice someone this week."
        action={
          <KeepViewLink
            href="/nominations/new"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-novo-coral px-3.5 text-sm font-medium text-novo-paper shadow-card transition hover:bg-novo-coral/90"
          >
            Recognize a teammate
          </KeepViewLink>
        }
      />
    )
  }

  return (
    <ol className="divide-y divide-novo-border rounded-lg border border-novo-border bg-novo-elevated shadow-card">
      {items.map((item) => (
        <FeedRow key={item.nomination.id} item={item} viewerId={viewerId} />
      ))}
    </ol>
  )
}

function FeedRow({
  item,
  viewerId,
}: {
  item: RecognitionFeedItem
  viewerId: string
}) {
  const nominatorName =
    item.nominator?.id === viewerId
      ? 'You'
      : firstName(item.nominator?.name) ?? 'Someone'
  const nomineeName =
    item.nominee?.id === viewerId
      ? 'you'
      : item.nominee?.name ?? 'a teammate'
  const valueName = item.value?.name ?? 'a Novo value'
  const valueId = item.value?.id ?? item.nomination.value_id

  return (
    <li className="flex gap-4 p-5 hover:bg-novo-hover/60">
      <Avatar name={item.nominee?.name ?? '?'} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-novo-subtle">
          <span className="font-medium text-novo-ink">{nominatorName}</span>{' '}
          recognized{' '}
          <span className="font-medium text-novo-ink">{nomineeName}</span>{' '}
          for{' '}
          <ValueTag valueId={valueId} name={valueName} />
        </p>
        <p className="mt-2 text-[15px] leading-6 text-novo-ink">
          &ldquo;{item.nomination.behavior_text}&rdquo;
        </p>
        {item.nomination.outcome_text && (
          <p className="mt-1 text-sm text-novo-subtle">
            {item.nomination.outcome_text}
          </p>
        )}
        <div className="mt-3 flex items-center gap-3 text-xs text-novo-muted">
          <TierChip tier={item.nomination.current_tier} />
          <span className="tabular" suppressHydrationWarning>
            {formatRelative(item.at)}
          </span>
        </div>
      </div>
    </li>
  )
}

function Avatar({ name }: { name: string }) {
  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '·'
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-novo-pink-tint text-xs font-semibold text-novo-oxblood"
    >
      {initials}
    </span>
  )
}

function ValueTag({ valueId, name }: { valueId: string; name: string }) {
  const tone = valueTagClasses(valueId)
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ${tone}`}
    >
      {name}
    </span>
  )
}

function TierChip({ tier }: { tier: number }) {
  // Tier 0 is the new peer-recognition kind (non-monetary, no approval).
  // The remaining labels stay descriptive of who acts on the record:
  // Spot is what a manager approves, Cross-team is the dept-head queue,
  // Leadership is the committee.
  const label =
    tier === 0
      ? 'Peer'
      : tier === 1
        ? 'Spot'
        : tier === 2
          ? 'Cross-team'
          : 'Leadership'
  return (
    <span className="inline-flex items-center rounded border border-novo-border bg-novo-surface px-1.5 py-0.5 text-2xs font-medium text-novo-subtle">
      {label}
    </span>
  )
}

function firstName(full?: string | null): string | null {
  if (!full) return null
  return full.split(' ')[0] ?? null
}

function formatRelative(d: Date): string {
  const now = Date.now()
  const ms = now - d.getTime()
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
