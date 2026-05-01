import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import { listCatalogItems } from '@/modules/catalog/service'
import { toggleCatalogItemActiveAction } from './actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, LinkButton } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

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
    <main className="mx-auto max-w-app px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/people-ops', label: 'People Ops' }}
        title="Reward catalog"
        description="Per geo. Approvers see only active items within the target tier range."
        actions={
          <LinkButton href="/people-ops/catalog/new" variant="primary">
            New item
          </LinkButton>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="No catalog items yet"
          description="Add at least one item per geo so approvers have something to pick from at reward selection time."
          action={
            <LinkButton href="/people-ops/catalog/new" variant="primary">
              Add first item
            </LinkButton>
          }
        />
      ) : (
        <div className="space-y-8">
          {(['US', 'India', 'Colombia'] as const).map((geo) => (
            <section key={geo}>
              <header className="mb-3 flex items-baseline justify-between">
                <h2 className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
                  {geo}
                </h2>
                <span className="text-2xs tabular text-novo-muted">
                  {byGeo[geo].length}{' '}
                  {byGeo[geo].length === 1 ? 'item' : 'items'}
                </span>
              </header>
              {byGeo[geo].length === 0 ? (
                <p className="rounded-lg border border-dashed border-novo-border px-4 py-6 text-center text-sm text-novo-subtle">
                  No items for {geo} yet. Use &ldquo;Add item&rdquo; above and
                  set the geo to {geo} so approvers there have something to
                  pick.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-novo-border bg-novo-elevated shadow-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-novo-border bg-novo-surface/60 text-left text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
                        <th className="px-4 py-2.5">Item</th>
                        <th className="px-4 py-2.5">Type</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                        <th className="px-4 py-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-novo-border">
                      {byGeo[geo].map((item) => (
                        <tr
                          key={item.id}
                          className="transition hover:bg-novo-hover/40"
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-novo-ink">
                              {item.name}
                            </p>
                            <p className="mt-0.5 text-xs text-novo-subtle">
                              {item.description}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs text-novo-subtle">
                            {item.reward_type}
                            {item.vendor ? ` · ${item.vendor}` : ''}
                          </td>
                          <td className="px-4 py-3 text-right text-novo-ink tabular">
                            ${item.amount_usd}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <form action={toggleCatalogItemActiveAction}>
                              <input type="hidden" name="id" value={item.id} />
                              <input
                                type="hidden"
                                name="active"
                                value={item.active ? 'false' : 'true'}
                              />
                              <Button
                                type="submit"
                                variant={item.active ? 'ghost' : 'secondary'}
                                size="sm"
                              >
                                {item.active ? 'Deactivate' : 'Reactivate'}
                              </Button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
