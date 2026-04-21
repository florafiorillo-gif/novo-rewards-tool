import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import { createCatalogItemAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function NewCatalogItemPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isPeopleTeamRep(employeeId))) notFound()

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <header className="mb-6">
        <Link
          href="/people-ops/catalog"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Catalog
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">New catalog item</h1>
      </header>

      <form action={createCatalogItemAction} className="space-y-4">
        <Field label="Geo" htmlFor="geo">
          <select
            id="geo"
            name="geo"
            required
            defaultValue=""
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
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
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Choose
            </option>
            <option value="gift_card">Gift card</option>
            <option value="experience">Experience</option>
            <option value="l_and_d">Learning & development</option>
            <option value="cash">Cash</option>
            <option value="custom">Custom</option>
          </select>
        </Field>

        <Field label="Vendor (optional)" htmlFor="vendor">
          <input
            id="vendor"
            name="vendor"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Name" htmlFor="name">
          <input
            id="name"
            name="name"
            required
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            required
            rows={3}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
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
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </Field>

        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Create
        </button>
      </form>
    </main>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-gray-900">
        {label}
      </label>
      {children}
    </div>
  )
}
