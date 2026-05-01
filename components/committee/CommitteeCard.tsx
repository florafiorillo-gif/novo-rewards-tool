import type { HydratedTier3 } from '@/modules/committee/service'
import { recuseCommitteeAction } from '@/app/leadership/queue/actions'
import { TIER_RANGES } from '@/modules/catalog/types'
import { valueTagClasses } from '@/modules/values/constants'
import { CommitteeDecisionForm } from './CommitteeDecisionForm'
import { Button } from '@/components/ui/Button'

interface ScopeNote {
  id: string
  template_text: string
}

interface Props {
  item: HydratedTier3
  viewerEmployeeId: string
  scopeNotes: ScopeNote[]
}

// Weightier treatment than the approval queue: the committee deliberates on
// these, so the full story, evidence, prior notes, and decision tooling all
// render in one expansive card. No disclosure collapse.
export function CommitteeCard({ item, viewerEmployeeId, scopeNotes }: Props) {
  const { nomination, nominator, nominee, viewer_conflict, viewer_recused, prior_decisions } =
    item
  const deferredCount = prior_decisions.filter((d) => d.decision === 'defer').length

  return (
    <article className="overflow-hidden rounded-xl border border-novo-border bg-novo-elevated shadow-card">
      {/* ── Header strip ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-novo-border bg-novo-surface/60 px-6 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-2xs text-novo-muted">
            <span className="inline-flex items-center rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700">
              Tier 3 · committee
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${valueTagClasses(nomination.value_id)}`}
            >
              {nomination.value_id.replace('val_', '').replace(/_/g, ' ')}
            </span>
            <span>{nominee?.geo ?? '—'}</span>
            <span className="tabular">
              submitted {new Date(nomination.submitted_at).toLocaleDateString()}
            </span>
          </div>
          <p className="mt-2 text-lg font-semibold tracking-tight text-novo-ink">
            {nominator?.name ?? 'Someone'} recognized {nominee?.name ?? 'a teammate'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {nomination.urgent && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-amber-900">
              <span
                aria-hidden
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"
              />
              Urgent
            </span>
          )}
          {deferredCount >= 2 && (
            <span className="inline-flex items-center rounded-full border border-novo-coral/30 bg-novo-pink-tint px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-novo-coral">
              Deferred twice. Consult Jackson.
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-6">
        {/* ── Conflict banner ─────────────────────────────────────── */}
        {viewer_conflict && !viewer_recused && (
          <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Conflict of interest</p>
            <p className="mt-1 text-xs">
              This nominee is a direct or skip-level report of yours. Please
              recuse; the other committee member (or Jackson) decides.
            </p>
            <form action={recuseCommitteeAction} className="mt-3">
              <input type="hidden" name="nomination_id" value={nomination.id} />
              <Button type="submit" variant="secondary" size="sm">
                Recuse
              </Button>
            </form>
          </section>
        )}

        {viewer_recused && (
          <p className="mb-5 text-xs italic text-novo-muted">
            You recused from this nomination.
          </p>
        )}

        {/* ── Story ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <div>
            <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
              What they did
            </p>
            <p className="mt-1 text-[15px] italic leading-7 text-novo-ink">
              &ldquo;{nomination.behavior_text}&rdquo;
            </p>
          </div>
          <div>
            <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
              Outcome
            </p>
            <p className="mt-1 text-sm leading-6 text-novo-subtle">
              {nomination.outcome_text}
            </p>
          </div>
          {nomination.evidence_links.length > 0 && (
            <div>
              <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
                Evidence
              </p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-novo-subtle">
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
            </div>
          )}
        </section>

        {/* ── Prior committee notes ───────────────────────────── */}
        {prior_decisions.length > 0 && (
          <section className="mt-5 rounded-lg border border-novo-border bg-novo-hover/50 p-4">
            <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
              Prior committee notes
            </p>
            <ul className="mt-2 space-y-1 text-xs text-novo-subtle">
              {prior_decisions.map((d) => (
                <li key={d.id}>
                  <span className="mr-1 inline-flex items-center rounded border border-novo-border bg-novo-paper px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-novo-subtle">
                    {d.decision}
                  </span>
                  {d.decision_log_text ?? '—'}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Decision form ────────────────────────────────────── */}
        {!viewer_recused && (
          <section className="mt-6 border-t border-novo-border pt-6">
            <p className="mb-3 text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
              Record the committee&rsquo;s decision
            </p>
            <CommitteeDecisionForm
              nominationId={nomination.id}
              tier3Range={TIER_RANGES[3]}
              scopeNotes={scopeNotes}
            />
          </section>
        )}
      </div>
    </article>
  )
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
