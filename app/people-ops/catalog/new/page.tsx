import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import { createCatalogItemAction } from '../actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

export default async function NewCatalogItemPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isPeopleTeamRep(employeeId))) notFound()

  return (
    <main className="mx-auto max-w-content px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/people-ops/catalog', label: 'Catalog' }}
        eyebrow="People Ops · Catalog"
        title="New item"
      />

      <form action={createCatalogItemAction} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Geo" htmlFor="geo">
            <select
              id="geo"
              name="geo"
              required
              defaultValue=""
              className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink focus:border-novo-ink"
            >
              <option value="" disabled>
                Choose
              </option>
              <option value="US">US</option>
              <option value="India">India</option>
              <option value="Colombia">Colombia</option>
            </select>
          </Field>

          <Field label="Reward type" htmlFor="reward_type">
            <select
              id="reward_type"
              name="reward_type"
              required
              defaultValue=""
              className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink focus:border-novo-ink"
            >
              <option value="" disabled>
                Choose
              </option>
              <option value="gift_card">Gift card</option>
              <option value="experience">Experience</option>
              <option value="l_and_d">Learning &amp; development</option>
              <option value="cash">Cash</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
        </div>

        <Field
          label="Vendor"
          htmlFor="vendor"
          hint="Optional. e.g. Amazon, DoorDash, Udemy."
        >
          <input
            id="vendor"
            name="vendor"
            className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink focus:border-novo-ink"
          />
        </Field>

        <Field label="Name" htmlFor="name">
          <input
            id="name"
            name="name"
            required
            className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink focus:border-novo-ink"
          />
        </Field>

        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            required
            rows={3}
            className="block w-full rounded-md border border-novo-border bg-novo-paper px-3 py-2 text-sm text-novo-ink placeholder:text-novo-muted focus:border-novo-ink"
          />
        </Field>

        <Field label="Amount (USD)" htmlFor="amount_usd">
          <input
            id="amount_usd"
            name="amount_usd"
            type="number"
            min={1}
            step={1}
            required
            className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm tabular text-novo-ink focus:border-novo-ink"
          />
        </Field>

        <div className="flex items-center justify-end border-t border-novo-border pt-6">
          <Button type="submit" size="lg">
            Create
          </Button>
        </div>
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
