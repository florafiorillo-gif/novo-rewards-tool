import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { getNominationById } from '@/modules/nominations/service'
import { getEmployeeById } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import { listCatalogForSelection } from '@/modules/catalog/service'
import { listScopeNoteTemplates } from '@/modules/scope-notes/service'
import { TIER_RANGES } from '@/modules/catalog/types'
import { getActivePeriod } from '@/modules/budget/periods'
import { resolvePoolForNomination } from '@/modules/budget/routing'
import { getRewardForNomination } from '@/modules/rewards/service'
import { RewardSelectionForm } from '@/components/rewards/RewardSelectionForm'

export const dynamic = 'force-dynamic'

export default async function RewardSelectionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')

  const { id } = await params
  const nomination = await getNominationById(id)
  if (!nomination) notFound()

  // Reward already picked → send back to the queue.
  const existing = await getRewardForNomination(nomination.id)
  if (existing) redirect('/approvals/queue')

  // Authorization: only an approver on the nomination.
  // Tier 1: current approver (or self-approval nominator).
  // Tier 2: dept head picks; People team rep confirms via queue button
  //   (they don't reach this page directly). Reward saves with
  //   status=selected_pending_confirm so the rep's queue surfaces it.
  // Tier 3: handled inline in the committee decision form, not here.
  const isTier2 = nomination.current_tier === 2
  if (nomination.current_tier === 1) {
    const isSelfApproval = nomination.nominator_id === employeeId
    const isManagerApprover = nomination.current_approver_id === employeeId
    if (!isSelfApproval && !isManagerApprover) notFound()
  } else if (isTier2) {
    if (nomination.status !== 'approved') redirect('/approvals/queue')
    if (nomination.tier2_dept_head_id !== employeeId) notFound()
  } else {
    // Tier 3 — reward picked inside the committee decision form.
    redirect('/committee/queue')
  }

  const nominee = await getEmployeeById(nomination.nominee_id)
  if (!nominee) notFound()
  const value = getValueById(nomination.value_id)

  const tier = nomination.current_tier as 1 | 2 | 3
  const range = TIER_RANGES[tier]

  const [catalog, scopeNotes, activePeriod, poolResolution] = await Promise.all([
    listCatalogForSelection({ geo: nominee.geo, tier }),
    listScopeNoteTemplates({ tier, active_only: true }),
    getActivePeriod(),
    resolvePoolForNomination({
      nomination_id: nomination.id,
      current_tier: tier,
      nominator_id: nomination.nominator_id,
      nominee_id: nomination.nominee_id,
      nominee_manager_id: nominee.manager_id,
      nominee_geo: nominee.geo,
      nominee_department: nominee.department,
    }),
  ])

  const pool = poolResolution.ok ? poolResolution.pool : null
  const daysRemaining = activePeriod
    ? Math.max(
        0,
        Math.ceil(
          (activePeriod.end_date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        )
      )
    : 0

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <header className="mb-6">
        <Link
          href="/approvals/queue"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to queue
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">
          Choose a reward for {nominee.name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {value?.name ?? 'Value'} · Tier {tier} · ${range.min}–${range.max}
        </p>
      </header>

      <section className="mb-6 space-y-3 rounded-md bg-gray-50 p-4 text-sm text-gray-700">
        <p className="italic">&ldquo;{nomination.behavior_text}&rdquo;</p>
        <p className="italic">&ldquo;{nomination.outcome_text}&rdquo;</p>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-md border border-gray-200 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Pool balance
          </p>
          <p className="mt-1 text-lg font-medium text-gray-900">
            {pool ? `$${pool.remaining_amount_usd.toLocaleString()}` : '—'}
          </p>
          {pool && (
            <p className="mt-1 text-xs text-gray-500">
              of ${pool.allocated_amount_usd.toLocaleString()} allocated
            </p>
          )}
        </div>
        <div className="rounded-md border border-gray-200 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Time remaining
          </p>
          <p className="mt-1 text-lg font-medium text-gray-900">
            {activePeriod ? `${daysRemaining} days` : '—'}
          </p>
          {activePeriod && (
            <p className="mt-1 text-xs text-gray-500">
              period ends {activePeriod.end_date.toLocaleDateString()}
            </p>
          )}
        </div>
      </section>

      {!pool && (
        <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          We couldn't resolve a pool for this nomination. Reach out to the
          committee — there may be no active budget period.
        </p>
      )}

      <RewardSelectionForm
        nominationId={nomination.id}
        nomineeGeo={nominee.geo}
        tier={tier}
        range={range}
        catalog={catalog.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          reward_type: c.reward_type,
          vendor: c.vendor,
          amount_usd: c.amount_usd,
        }))}
        scopeNotes={scopeNotes.map((t) => ({
          id: t.id,
          template_text: t.template_text,
        }))}
        poolRemaining={pool?.remaining_amount_usd ?? 0}
      />
    </main>
  )
}
