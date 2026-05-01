import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import { PageHeader } from '@/components/ui/PageHeader'
import { KeepViewLink } from '@/components/layout/KeepViewLink'

export const dynamic = 'force-dynamic'

const TILES: Array<{
  href: string
  title: string
  description: string
}> = [
  {
    href: '/people-ops/dashboard',
    title: 'Program dashboard',
    description:
      'Pools by geo, reserve draws, SLA misses for the current quarter.',
  },
  {
    href: '/leadership/participation',
    title: 'Participation patterns',
    description:
      "Drill into who's giving and receiving across geos, departments, and managers. Lowest participation surfaces first.",
  },
  {
    href: '/people-ops/fulfillment',
    title: 'Fulfillment queue',
    description:
      'Manual sourcing, cash batches, and failed rewards needing attention.',
  },
  {
    href: '/people-ops/catalog',
    title: 'Reward catalog',
    description:
      'Per-geo reward options. Approvers pick from here at selection time.',
  },
  {
    href: '/people-ops/scope-notes',
    title: 'Scope note templates',
    description:
      'Starting points approvers attach to rewards. One per tier, editable.',
  },
]

export default async function PeopleOpsHomePage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isPeopleTeamRep(employeeId))) notFound()

  return (
    <main className="mx-auto max-w-app px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        eyebrow="People Ops"
        title="Operations"
        description="Catalog, scope notes, fulfillment, and program-wide health. Everything People team needs to run the recognition program."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {TILES.map((tile) => (
          <KeepViewLink
            key={tile.href}
            href={tile.href}
            className="group rounded-lg border border-novo-border bg-novo-elevated p-5 shadow-card transition hover:bg-novo-hover"
          >
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold text-novo-ink">{tile.title}</p>
              <span
                aria-hidden
                className="text-novo-muted transition group-hover:text-novo-ink"
              >
                →
              </span>
            </div>
            <p className="mt-1.5 text-xs text-novo-subtle">{tile.description}</p>
          </KeepViewLink>
        ))}
      </div>
    </main>
  )
}
