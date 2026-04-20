import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { isCommitteeMember } from '@/modules/roles/service'
import { DEFAULT_ALLOCATION_CONFIG } from '@/modules/budget/types'
import { createPeriodAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function NewBudgetPeriodPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isCommitteeMember(employeeId))) notFound()

  const d = DEFAULT_ALLOCATION_CONFIG

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <header className="mb-6">
        <Link
          href="/committee/budget"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to periods
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">
          New budget period
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Percentages below are v1 defaults — the committee adjusts per quarter
          based on the prior period's actuals.
        </p>
      </header>

      <form action={createPeriodAction} className="space-y-5">
        <Field label="Label" htmlFor="period_label" hint="e.g., Q2 2026">
          <input
            id="period_label"
            name="period_label"
            required
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date" htmlFor="start_date">
            <input
              id="start_date"
              name="start_date"
              type="date"
              required
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label="End date" htmlFor="end_date">
            <input
              id="end_date"
              name="end_date"
              type="date"
              required
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
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
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </Field>

        <fieldset className="rounded-md border border-gray-200 bg-gray-50 p-4">
          <legend className="px-2 text-xs uppercase tracking-wide text-gray-500">
            Allocation split (v1 defaults)
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tier 3 %" htmlFor="tier3_pct">
              <input
                id="tier3_pct"
                name="tier3_pct"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={d.tier3_pct}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Reserve %" htmlFor="reserve_pct">
              <input
                id="reserve_pct"
                name="reserve_pct"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={d.reserve_pct}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            The remainder splits across geos by active headcount; within each
            geo the three percentages below sum to 100.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <Field label="Manager T1 %" htmlFor="manager_tier1_pct">
              <input
                id="manager_tier1_pct"
                name="manager_tier1_pct"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={d.within_geo.manager_tier1_pct}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Peer T1 %" htmlFor="peer_tier1_pct">
              <input
                id="peer_tier1_pct"
                name="peer_tier1_pct"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={d.within_geo.peer_tier1_pct}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Dept T2 %" htmlFor="dept_tier2_pct">
              <input
                id="dept_tier2_pct"
                name="dept_tier2_pct"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={d.within_geo.dept_tier2_pct}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </fieldset>

        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Create draft
        </button>
      </form>
    </main>
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
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium text-gray-900">
          {label}
        </label>
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
