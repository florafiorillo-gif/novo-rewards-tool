import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getEmployeeById } from '@/modules/employees/service'
import type { RecognitionPreference } from '@/modules/employees/types'
import { updateRecognitionPreferenceAction } from './actions'

export const dynamic = 'force-dynamic'

const OPTIONS: Array<{
  value: RecognitionPreference
  label: string
  description: string
}> = [
  {
    value: 'public',
    label: 'Public',
    description:
      'Your recognition posts to #made-it-happen. The default — most people leave this on.',
  },
  {
    value: 'team_only',
    label: 'Team only',
    description:
      'Post is limited to your team channel. (Falls back to private in v1 while team channels are being set up.)',
  },
  {
    value: 'private',
    label: 'Private',
    description:
      'No public post. You, your nominator, and the approver are notified. Your reward is still delivered; digests and dashboards still include it.',
  },
]

export default async function SettingsPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')

  const employee = await getEmployeeById(employeeId)
  if (!employee) redirect('/auth/signin')

  const current = employee.recognition_preference

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <header className="mb-8">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">Settings</h1>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-medium text-gray-900">
          When you&apos;re recognized
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Controls how public your recognition is. You can change this any time.
        </p>

        <form action={updateRecognitionPreferenceAction} className="mt-5 space-y-3">
          {OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-3 hover:border-gray-300"
            >
              <input
                type="radio"
                name="preference"
                value={opt.value}
                defaultChecked={current === opt.value}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  {opt.label}
                </span>
                <span className="block text-sm text-gray-500">
                  {opt.description}
                </span>
              </span>
            </label>
          ))}

          <div className="pt-2">
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Save
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
