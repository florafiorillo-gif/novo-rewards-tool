import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getAllActiveEmployees } from '@/modules/employees/service'
import { VALUES } from '@/modules/values/constants'
import { NominationForm } from '@/components/forms/NominationForm'
import { PageHeader } from '@/components/ui/PageHeader'

export const dynamic = 'force-dynamic'

export default async function NewNominationPage() {
  const session = await auth()
  if (!session?.user?.employeeId) redirect('/auth/signin')
  const currentEmployeeId = session.user.employeeId

  const employees = (await getAllActiveEmployees())
    .filter((e) => e.id !== currentEmployeeId)
    .map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      role_title: e.role_title,
      manager_id: e.manager_id,
    }))

  return (
    <main className="mx-auto max-w-content px-6 py-10 lg:py-16">
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        eyebrow="Recognition"
        title="Recognize a teammate"
        description="Every nomination is an observation of a Novo value being lived. Keep it specific. The smallest acknowledgment is the one most often skipped."
      />

      <NominationForm
        employees={employees}
        values={VALUES.map((v) => ({
          id: v.id,
          name: v.name,
          behavior_placeholder: v.behavior_placeholder,
          description: shortDescription(v.description),
        }))}
        currentEmployeeId={currentEmployeeId}
      />
    </main>
  )
}

// VALUES.description is a paragraph; card UI wants a taut single line. Take
// the first sentence and drop trailing clause-joiners so it reads cleanly.
function shortDescription(raw: string): string {
  const firstSentence = raw.split(/\.\s/)[0].trim()
  return firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`
}
