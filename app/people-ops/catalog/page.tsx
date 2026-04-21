import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import { listCatalogItems } from '@/modules/catalog/service'
import { toggleCatalogItemActiveAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function CatalogPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isPeopleTeamRep(employeeId))) notFound()

  const items = await listCatalogItems()
  const byGeo = {
    US: items.filter((i) => i.geo === 'US'),
    India: items.filter((i) => i.geo === 'India'),
    Colombia: items.filter((i) => i.geo === 'Colombia'),
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <Link href="/people-ops" className="text-sm text-gray-500 hover:text-gray-700">
            ← People Ops
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-gray-900">Reward catalog</h1>
          <p className="mt-1 text-sm text-gray-500">
            Per geo. Approvers see only active items within the target tier range.
          </p>
        </div>
        <Link
          href="/people-ops/catalog/new"
          className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          New item
        </Link>
      </header>

      {(['US', 'India', 'Colombia'] as const).map((geo) => (
        <section key={geo} className="mb-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
            {geo} · {byGeo[geo].length} item{byGeo[geo].length === 1 ? '' : 's'}
          </h2>
          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            {byGeo[geo].length === 0 && (
              <p className="p-4 text-sm text-gray-500">No items yet.</p>
            )}
            {byGeo[geo].map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between p-4 text-sm"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {item.name}{' '}
                    {!item.active && (
                      <span className="ml-2 text-xs font-normal uppercase text-gray-400">
                        inactive
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    ${item.amount_usd} · {item.reward_type} ·{' '}
                    {item.vendor ?? 'no vendor'}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">{item.description}</p>
                </div>
                <form action={toggleCatalogItemActiveAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <input
                    type="hidden"
                    name="active"
                    value={item.active ? 'false' : 'true'}
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {item.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
