import type {
  TeamRecognitionGroup,
  TeamRecognitionItem,
} from '@/modules/dashboard/team-recognitions-view'
import { valueTagClasses } from '@/modules/values/constants'

// Read-only feed of recognitions received by a manager's direct reports.
// One section per recipient, recognitions stacked newest-first beneath.
// Grouping + ordering is decided by the data layer; this component just
// renders the shape it receives. Empty groups are filtered upstream so
// no defensive empty-state branches live here.

interface Props {
  groups: TeamRecognitionGroup[]
}

export function TeamRecognitionsFeed({ groups }: Props) {
  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <RecipientSection key={group.recipient.id} group={group} />
      ))}
    </div>
  )
}

function RecipientSection({ group }: { group: TeamRecognitionGroup }) {
  return (
    <section aria-labelledby={`recipient-${group.recipient.id}`}>
      <header className="mb-3">
        <h2
          id={`recipient-${group.recipient.id}`}
          className="text-xl font-semibold tracking-tight text-novo-ink"
        >
          {group.recipient.name}
        </h2>
        <p className="mt-0.5 text-xs text-novo-subtle">
          {group.recipient.role_title}
        </p>
      </header>
      <ol className="divide-y divide-novo-border rounded-lg border border-novo-border bg-novo-elevated shadow-card">
        {group.recognitions.map((item) => (
          <RecognitionRow
            key={item.id}
            item={item}
            recipientName={group.recipient.name}
          />
        ))}
      </ol>
    </section>
  )
}

function RecognitionRow({
  item,
  recipientName,
}: {
  item: TeamRecognitionItem
  recipientName: string
}) {
  const giverFirst = firstName(item.giver_name) ?? item.giver_name
  const recipientFirst = firstName(recipientName) ?? recipientName
  const valueId = item.value?.id ?? ''
  return (
    <li className="p-5">
      <p className="text-sm text-novo-subtle">
        <span className="font-medium text-novo-ink">{giverFirst}</span>
        {' recognized '}
        <span className="font-medium text-novo-ink">{recipientFirst}</span>
        {' for '}
        <ValueTag valueId={valueId} name={item.value_name} />
      </p>
      <p className="mt-2 text-[15px] leading-6 text-novo-ink">
        &ldquo;{item.behavior_text}&rdquo;
      </p>
      {item.outcome_text && (
        <p className="mt-1 text-sm text-novo-subtle">{item.outcome_text}</p>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-novo-muted">
        <TierChip label={item.tier_label} />
        <span className="tabular" suppressHydrationWarning>
          {formatRelative(item.date)}
        </span>
      </div>
    </li>
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

function TierChip({ label }: { label: string }) {
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

// Same cadence as the home feed's relative formatter so the two surfaces
// read in lockstep. Falls back to "Mon D" once we cross ~5 weeks.
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
