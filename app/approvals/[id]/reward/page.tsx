import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import {
  getNominationById,
  listGroupSiblings,
} from '@/modules/nominations/service'
import { getEmployeeById } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import { listCatalogForSelection } from '@/modules/catalog/service'
import { listScopeNoteTemplates } from '@/modules/scope-notes/service'
import { TIER_RANGES } from '@/modules/catalog/types'
import { getActivePeriod } from '@/modules/budget/periods'
import { resolvePoolForNomination } from '@/modules/budget/routing'
import { getRewardForNomination } from '@/modules/rewards/service'
import {
  RewardSelectionForm,
  type RewardSiblingSummary,
} from '@/components/rewards/RewardSelectionForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'

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

  const existing = await getRewardForNomination(nomination.id)
  if (existing) redirect('/review')

  const isTier2 = nomination.current_tier === 2
  if (nomination.current_tier === 1) {
    const isSelfApproval = nomination.nominator_id === employeeId
    const isManagerApprover = nomination.current_approver_id === employeeId
    if (!isSelfApproval && !isManagerApprover) notFound()
  } else if (isTier2) {
    if (nomination.status !== 'approved') redirect('/review')
    if (nomination.tier2_dept_head_id !== employeeId) notFound()
  } else {
    redirect('/leadership/queue')
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

  // Group siblings the SAME approver can also act on right now:
  // same group, different nomination, status=approved, no reward
  // yet, and the viewer is the appropriate approver for that tier.
  // Empty list when this is a single-recipient nomination or the
  // viewer doesn't own any other siblings in the group.
  const siblingsForViewer: RewardSiblingSummary[] = []
  if (nomination.team_award_group_id) {
    const allSiblings = await listGroupSiblings(nomination.team_award_group_id)
    for (const s of allSiblings) {
      if (s.id === nomination.id) continue
      if (s.status !== 'approved') continue
      const isMyT1 =
        s.current_tier === 1 && s.current_approver_id === employeeId
      const isMyT2 =
        s.current_tier === 2 && s.tier2_dept_head_id === employeeId
      if (!isMyT1 && !isMyT2) continue
      const sibReward = await getRewardForNomination(s.id)
      if (sibReward) continue
      const sibNominee = await getEmployeeById(s.nominee_id)
      if (!sibNominee) continue
      siblingsForViewer.push({
        nomination_id: s.id,
        nominee_name: sibNominee.name,
        geo: sibNominee.geo,
      })
    }
  }

  return (
    <main className="mx-auto max-w-content px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/review', label: 'Review' }}
        eyebrow={`Tier ${tier} · ${value?.name ?? 'Value'}`}
        title={`Choose a reward for ${nominee.name}`}
        description={`Tier ${tier} range: $${range.min.toLocaleString()}–$${range.max.toLocaleString()}. Pick from the catalog, cash, or custom.`}
      />

      <Card className="mb-6">
        <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
          What they did
        </p>
        <p className="mt-2 text-[15px] italic leading-6 text-novo-ink">
          &ldquo;{nomination.behavior_text}&rdquo;
        </p>
        <p className="mt-2 text-sm text-novo-subtle">
          {nomination.outcome_text}
        </p>
      </Card>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Stat
          label="Pool balance"
          value={pool ? `$${pool.remaining_amount_usd.toLocaleString()}` : '—'}
          hint={
            pool
              ? `of $${pool.allocated_amount_usd.toLocaleString()} allocated`
              : undefined
          }
        />
        <Stat
          label="Time remaining"
          value={activePeriod ? `${daysRemaining} days` : '—'}
          hint={
            activePeriod
              ? `period ends ${activePeriod.end_date.toLocaleDateString()}`
              : undefined
          }
        />
      </div>

      {!pool && (
        <p className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          We couldn&rsquo;t resolve a pool for this nomination. Reach out to the
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
        siblingsForViewer={siblingsForViewer}
        focusedNomineeName={nominee.name}
      />
    </main>
  )
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-novo-border bg-novo-elevated px-4 py-3 shadow-card">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-novo-ink tabular">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-2xs text-novo-muted">{hint}</p>}
    </div>
  )
}
