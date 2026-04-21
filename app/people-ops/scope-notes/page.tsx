import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import { listScopeNoteTemplates } from '@/modules/scope-notes/service'
import {
  createScopeNoteAction,
  toggleScopeNoteActiveAction,
} from './actions'

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
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="mb-6">
        <Link href="/people-ops" className="text-sm text-gray-500 hover:text-gray-700">
          ← People Ops
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">Scope note templates</h1>
        <p className="mt-1 text-sm text-gray-500">
          Shown as a dropdown at reward selection. Approvers pick one and can
          edit before committing — templates are starting points, not final copy.
        </p>
      </header>

      {([1, 2, 3] as const).map((tier) => (
        <section key={tier} className="mb-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
            Tier {tier}
          </h2>
          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            {byTier[tier].length === 0 && (
              <p className="p-4 text-sm text-gray-500">None yet.</p>
            )}
            {byTier[tier].map((t) => (
              <div
                key={t.id}
                className="flex items-start justify-between gap-4 p-4 text-sm"
              >
                <p
                  className={
                    'flex-1 ' + (t.active ? 'text-gray-900' : 'text-gray-400')
                  }
                >
                  {t.template_text}
                  {!t.active && (
                    <span className="ml-2 text-xs uppercase">inactive</span>
                  )}
                </p>
                <form action={toggleScopeNoteActiveAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="active" value={t.active ? 'false' : 'true'} />
                  <button
                    type="submit"
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {t.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="mt-10 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-3 text-sm font-medium text-gray-900">Add template</h3>
        <form action={createScopeNoteAction} className="space-y-3">
          <select
            name="tier"
            required
            defaultValue=""
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Choose tier
            </option>
            <option value="1">Tier 1 — Spot</option>
            <option value="2">Tier 2 — Impact</option>
            <option value="3">Tier 3 — Value Share</option>
          </select>
          <textarea
            name="template_text"
            required
            rows={3}
            placeholder="Short, warm. Rubina's copy pass will finalize these pre-launch."
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create
          </button>
        </form>
      </section>
    </main>
  )
}
