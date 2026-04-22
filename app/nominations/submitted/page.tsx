import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getEmployeeById } from '@/modules/employees/service'
import { getNominationById } from '@/modules/nominations/service'
import { getValueById } from '@/modules/values/constants'
import { cancelNominationAction } from '../actions'

export const dynamic = 'force-dynamic'

// 24-hour cancel window (spec §13.2). After that, nominator needs People team help.
const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000

export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const session = await auth()
  if (!session?.user?.employeeId) redirect('/auth/signin')

  const params = await searchParams
  const id = params.id
  if (!id) redirect('/nominations/new')

  const nomination = await getNominationById(id)
  if (!nomination || nomination.nominator_id !== session.user.employeeId) {
    redirect('/nominations/new')
  }

  const [nominee, value] = await Promise.all([
    getEmployeeById(nomination.nominee_id),
    Promise.resolve(getValueById(nomination.value_id)),
  ])

  const cancellable =
    nomination.status === 'submitted' &&
    Date.now() - nomination.submitted_at.getTime() < CANCEL_WINDOW_MS

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <h1 className="text-xl font-semibold text-gray-900">Nomination submitted</h1>
      <p className="mt-2 text-sm text-gray-700">
        Thank you. {nominee?.name ?? 'They'} will be recognized if approved.
      </p>

      <section className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <p>
          <span className="font-medium text-gray-900">Value:</span>{' '}
          {value?.name ?? '—'}
        </p>
        <p className="mt-2 italic">&ldquo;{nomination.behavior_text}&rdquo;</p>
      </section>

      {nomination.status === 'cancelled' && (
        <p className="mt-6 text-sm text-gray-500">This nomination was cancelled.</p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
        >
          Back to dashboard
        </Link>
        <Link
          href="/nominations/new"
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Recognize someone else
        </Link>
        {cancellable && (
          <form action={cancelWithId.bind(null, nomination.id)}>
            <button
              type="submit"
              className="text-sm text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
            >
              Cancel this nomination
            </button>
          </form>
        )}
      </div>

      {cancellable && (
        <p className="mt-3 text-xs text-gray-400">
          You can cancel within 24 hours of submitting.
        </p>
      )}
    </main>
  )
}

async function cancelWithId(id: string) {
  'use server'
  await cancelNominationAction(id)
}
