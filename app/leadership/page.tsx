import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isCommitteeMember } from '@/modules/roles/service'
import { PageHeader } from '@/components/ui/PageHeader'
import { KeepViewLink } from '@/components/layout/KeepViewLink'

export const dynamic = 'force-dynamic'

// Landing hub for everything a committee member does: the T3 decision
// queue, budget governance, and program-level health. Mirrors the
// shape of /people-ops so the nav can collapse to a single "Leadership"
// item without losing discovery of the three sub-surfaces.
const TILES: Array<{
  href: string
  title: string
  description: string
}> = [
  {
    href: '/leadership/queue',
    title: 'Decisions to review',
    description:
      'Tier 3 nominations waiting on the committee. Urgent items appear first.',
  },
  {
    href: '/leadership/budget',
    title: 'Budget governance',
    description:
      'Quarterly allocations. Create, approve, activate, and close periods.',
  },
  {
    href: '/leadership/dashboard',
    title: 'Program health',
    description:
      'Pools by geo, reserve draws, and SLA misses for the active period.',
  },
  {
    href: '/leadership/participation',
    title: 'Participation patterns',
    description:
      'Who is giving and receiving recognition, by geo, department, and manager.',
  },
]

export default async function LeadershipHomePage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isCommitteeMember(employeeId))) notFound()

  return (
    <main className="mx-auto max-w-app px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        title="Governance"
        description="Where the committee reviews Tier 3 nominations, sets and approves budget, and keeps an eye on program-wide signals."
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
