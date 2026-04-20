import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listPendingApprovalsForEmployee } from '@/modules/approvals/queries'
import { ApprovalCard } from '@/components/approvals/ApprovalCard'

export const dynamic = 'force-dynamic'

export default async function ApprovalsQueuePage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')

  const items = await listPendingApprovalsForEmployee(employeeId)

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Recognition to review</h1>
        <p className="mt-1 text-sm text-gray-500">
          {items.length === 0
            ? 'Nothing waiting on you right now.'
            : `${items.length} nomination${items.length === 1 ? '' : 's'} waiting.`}
        </p>
      </header>

      <div className="space-y-4">
        {items.map((item) => (
          <ApprovalCard
            key={item.nomination.id}
            hydrated={item}
            viewerEmployeeId={employeeId}
          />
        ))}
      </div>
    </main>
  )
}
