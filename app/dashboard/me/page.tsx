import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { getRecipientDashboardView } from '@/modules/dashboard/recipient-view'
import { RecipientRecognitionList } from '@/components/dashboard/RecipientRecognitionList'

export const dynamic = 'force-dynamic'

// Personal recognition history for the signed-in employee. Visible to
// everyone (spec §17 phase 7 "recipient web view"); access control is just
// "must be signed in." Tier and dollar amounts are deliberately stripped
// server-side in recipient-view.ts.
export default async function RecipientDashboardPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')

  const view = await getRecipientDashboardView(employeeId)

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-display text-3xl uppercase tracking-tight text-novo-ink">
          Your recognitions
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          What teammates have noticed and called out.
        </p>
      </header>

      <RecipientRecognitionList items={view.items} />

      <div className="mt-8">
        <Link
          href="/settings"
          className="text-xs text-gray-500 underline hover:text-gray-700"
        >
          Recognition preferences
        </Link>
      </div>
    </main>
  )
}
