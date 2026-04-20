import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-gray-900">
        Welcome, {session.user.name}
      </h1>
      <p className="mt-2 text-gray-500">Dashboard coming in Phase 7.</p>

      <div className="mt-8">
        <Link
          href="/nominations/new"
          className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
        >
          Recognize a teammate
        </Link>
      </div>
    </main>
  )
}
