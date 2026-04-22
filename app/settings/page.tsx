import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getEmployeeById } from '@/modules/employees/service'
import type { RecognitionPreference } from '@/modules/employees/types'
import { updateRecognitionPreferenceAction } from './actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

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
    <main className="mx-auto max-w-content px-6 py-10 lg:py-12">
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        eyebrow="Settings"
        title="Visibility preferences"
        description="Controls how public your recognition is. You can change this any time — the next nomination you receive will respect whatever this is at the moment it's approved."
      />

      <Card>
        <form action={updateRecognitionPreferenceAction} className="space-y-3">
          {OPTIONS.map((opt) => {
            const selected = current === opt.value
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                  selected
                    ? 'border-novo-ink bg-novo-hover/40'
                    : 'border-novo-border bg-novo-paper hover:border-novo-border-strong'
                }`}
              >
                <input
                  type="radio"
                  name="preference"
                  value={opt.value}
                  defaultChecked={selected}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-novo-ink">
                    {opt.label}
                  </span>
                  <span className="mt-1 block text-xs text-novo-subtle">
                    {opt.description}
                  </span>
                </span>
              </label>
            )
          })}

          <div className="flex items-center justify-end border-t border-novo-border pt-4">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Card>

      <p className="mt-6 text-xs text-novo-muted">
        Signed in as {employee.name}{' '}
        <span className="tabular">· {employee.email}</span> · {employee.role_title}
      </p>
    </main>
  )
}
