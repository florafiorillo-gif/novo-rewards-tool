import type { HydratedTier3 } from '@/modules/committee/service'
import { recuseCommitteeAction } from '@/app/committee/queue/actions'
import { TIER_RANGES } from '@/modules/catalog/types'
import { CommitteeDecisionForm } from './CommitteeDecisionForm'

interface ScopeNote {
  id: string
  template_text: string
}

interface Props {
  item: HydratedTier3
  viewerEmployeeId: string
  scopeNotes: ScopeNote[]
}

export function CommitteeCard({ item, viewerEmployeeId, scopeNotes }: Props) {
  const { nomination, nominator, nominee, viewer_conflict, viewer_recused, prior_decisions } =
    item

  const deferredCount = prior_decisions.filter((d) => d.decision === 'defer').length

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {nominator?.name ?? 'Someone'} recognized{' '}
            <span className="font-semibold">{nominee?.name ?? 'a teammate'}</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {nominee?.geo ?? '—'} · submitted{' '}
            {new Date(nomination.submitted_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          {nomination.urgent && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              Urgent
            </span>
          )}
          {deferredCount >= 2 && (
            <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
              Deferred twice — consult Jackson
            </span>
          )}
        </div>
      </div>

      {viewer_conflict && !viewer_recused && (
        <section className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Conflict of interest</p>
          <p className="mt-1 text-xs">
            This nominee is a direct or skip-level report of yours. Please recuse;
            the other committee member (or Jackson) decides.
          </p>
          <form action={recuseCommitteeAction} className="mt-3">
            <input type="hidden" name="nomination_id" value={nomination.id} />
            <button
              type="submit"
              className="rounded-md bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900"
            >
              Recuse
            </button>
          </form>
        </section>
      )}

      {viewer_recused && (
        <p className="mb-4 text-xs italic text-gray-500">
          You recused from this nomination.
        </p>
      )}

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

      {prior_decisions.length > 0 && (
        <section className="mb-4 rounded-md border border-gray-200 p-3 text-xs text-gray-600">
          <p className="mb-1 font-medium text-gray-900">Prior committee notes</p>
          {prior_decisions.map((d) => (
            <p key={d.id} className="mt-1">
              <span className="uppercase text-gray-500">{d.decision}</span>:{' '}
              {d.decision_log_text ?? '—'}
            </p>
          ))}
        </section>
      )}

      {!viewer_recused && (
        <CommitteeDecisionForm
          nominationId={nomination.id}
          tier3Range={TIER_RANGES[3]}
          scopeNotes={scopeNotes}
        />
      )}
    </article>
  )
}
