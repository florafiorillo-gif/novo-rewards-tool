import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isCommitteeMember } from '@/modules/roles/service'
import { DEFAULT_ALLOCATION_CONFIG } from '@/modules/budget/types'
import { createPeriodAction } from '../actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

export default async function NewBudgetPeriodPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isCommitteeMember(employeeId))) notFound()

  const d = DEFAULT_ALLOCATION_CONFIG

  return (
    <main className="mx-auto max-w-content px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/committee/budget', label: 'Budget periods' }}
        eyebrow="Committee · Budget"
        title="New period"
        description="Percentages below are v1 defaults — the committee adjusts per quarter based on the prior period's actuals."
      />

      <form action={createPeriodAction} className="space-y-8">
        <Section title="Period">
          <Field label="Label" htmlFor="period_label" hint="e.g. Q2 2026">
            <input
              id="period_label"
              name="period_label"
              required
              className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink focus:border-novo-ink"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date" htmlFor="start_date">
              <input
                id="start_date"
                name="start_date"
                type="date"
                required
                className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm tabular text-novo-ink focus:border-novo-ink"
              />
            </Field>
            <Field label="End date" htmlFor="end_date">
              <input
                id="end_date"
                name="end_date"
                type="date"
                required
                className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm tabular text-novo-ink focus:border-novo-ink"
              />
            </Field>
          </div>

          <Field
            label="Total allocation (USD)"
            htmlFor="total_allocation_usd"
            hint="Program-level number; geo split is computed from active headcount."
          >
            <input
              id="total_allocation_usd"
              name="total_allocation_usd"
              type="number"
              min={1}
              step={100}
              required
              className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm tabular text-novo-ink focus:border-novo-ink"
            />
          </Field>
        </Section>

        <Section
          title="Allocation split"
          hint="v1 defaults. The remainder after Tier 3 + reserve splits across geos by active headcount; within each geo the three percentages below sum to 100."
        >
          <div className="grid grid-cols-2 gap-4">
            <PctField id="tier3_pct" label="Tier 3 %" defaultValue={d.tier3_pct} />
            <PctField id="reserve_pct" label="Reserve %" defaultValue={d.reserve_pct} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <PctField
              id="manager_tier1_pct"
              label="Manager T1 %"
              defaultValue={d.within_geo.manager_tier1_pct}
            />
            <PctField
              id="peer_tier1_pct"
              label="Peer T1 %"
              defaultValue={d.within_geo.peer_tier1_pct}
            />
            <PctField
              id="dept_tier2_pct"
              label="Dept T2 %"
              defaultValue={d.within_geo.dept_tier2_pct}
            />
          </div>
        </Section>

        <div className="flex items-center justify-end gap-3 border-t border-novo-border pt-6">
          <Button type="submit" size="lg">
            Create draft
          </Button>
        </div>
      </form>
    </main>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-novo-ink">{title}</h2>
        {hint && <p className="mt-1 text-xs text-novo-subtle">{hint}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-novo-ink"
      >
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-novo-muted">{hint}</p>}
    </div>
  )
}

function PctField({
  id,
  label,
  defaultValue,
}: {
  id: string
  label: string
  defaultValue: number
}) {
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        name={id}
        type="number"
        min={0}
        max={100}
        step={1}
        defaultValue={defaultValue}
        className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm tabular text-novo-ink focus:border-novo-ink"
      />
    </Field>
  )
}
