import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import { listScopeNoteTemplates } from '@/modules/scope-notes/service'
import {
  createScopeNoteAction,
  toggleScopeNoteActiveAction,
} from './actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

export default async function ScopeNotesPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isPeopleTeamRep(employeeId))) notFound()

  const templates = await listScopeNoteTemplates()
  const byTier = {
    1: templates.filter((t) => t.tier === 1),
    2: templates.filter((t) => t.tier === 2),
    3: templates.filter((t) => t.tier === 3),
  } as const

  return (
    <main className="mx-auto max-w-content px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/people-ops', label: 'People Ops' }}
        title="Scope note templates"
        description="Shown as a dropdown at reward selection. Approvers pick one and can edit before committing. Templates are starting points, not final copy."
      />

      <div className="space-y-8">
        {([1, 2, 3] as const).map((tier) => (
          <section key={tier}>
            <header className="mb-3 flex items-baseline justify-between">
              <h2 className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
                Tier {tier}
              </h2>
              <span className="text-2xs tabular text-novo-muted">
                {byTier[tier].length}
              </span>
            </header>
            {byTier[tier].length === 0 ? (
              <p className="rounded-lg border border-dashed border-novo-border px-4 py-6 text-center text-sm text-novo-subtle">
                No Tier {tier} templates yet. Use the &ldquo;Add template&rdquo;
                form below and pick Tier {tier} so approvers have a starting
                point at reward selection.
              </p>
            ) : (
              <ul className="divide-y divide-novo-border rounded-lg border border-novo-border bg-novo-elevated shadow-card">
                {byTier[tier].map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start justify-between gap-4 p-4"
                  >
                    <p
                      className={`flex-1 text-sm leading-6 ${
                        t.active ? 'text-novo-ink' : 'text-novo-muted'
                      }`}
                    >
                      {t.template_text}
                      {!t.active && (
                        <span className="ml-2 inline-flex items-center rounded border border-novo-border bg-novo-hover px-1.5 py-0.5 text-2xs uppercase tracking-wide text-novo-muted">
                          Inactive
                        </span>
                      )}
                    </p>
                    <form action={toggleScopeNoteActiveAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={t.active ? 'false' : 'true'}
                      />
                      <Button
                        type="submit"
                        variant={t.active ? 'ghost' : 'secondary'}
                        size="sm"
                      >
                        {t.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <Card>
          <h3 className="text-sm font-semibold text-novo-ink">Add template</h3>
          <p className="mt-1 text-xs text-novo-subtle">
            Short, warm. Rubina&rsquo;s copy pass will finalize these pre-launch.
          </p>
          <form action={createScopeNoteAction} className="mt-4 space-y-3">
            <select
              name="tier"
              required
              defaultValue=""
              className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink focus:border-novo-ink"
            >
              <option value="" disabled>
                Choose tier
              </option>
              <option value="1">Tier 1 · Spot</option>
              <option value="2">Tier 2 · Impact</option>
              <option value="3">Tier 3 · Value Share</option>
            </select>
            <textarea
              name="template_text"
              required
              rows={3}
              placeholder="Draft the template copy."
              className="block w-full rounded-md border border-novo-border bg-novo-paper px-3 py-2 text-sm text-novo-ink placeholder:text-novo-muted focus:border-novo-ink"
            />
            <div className="flex justify-end">
              <Button type="submit">Create</Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  )
}
