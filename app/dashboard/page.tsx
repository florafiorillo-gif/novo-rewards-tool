import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold text-gray-900">
        Welcome, {session.user.name}
      </h1>
      <p className="mt-2 text-gray-500">
        Dashboard coming in Phase 7.
      </p>
    </main>
  )
}
