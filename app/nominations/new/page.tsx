import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getAllActiveEmployees } from '@/modules/employees/service'
import { VALUES } from '@/modules/values/constants'
import { NominationForm } from '@/components/forms/NominationForm'

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
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Recognize a teammate</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every nomination is an observation of a Novo value being lived. Thank you for
          noticing.
        </p>
      </header>

      <NominationForm
        employees={employees}
        values={VALUES.map((v) => ({
          id: v.id,
          name: v.name,
          behavior_placeholder: v.behavior_placeholder,
        }))}
        currentEmployeeId={currentEmployeeId}
      />
    </main>
  )
}
