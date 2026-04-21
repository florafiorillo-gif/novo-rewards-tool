import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isPeopleTeamRep } from '@/modules/roles/service'
import { listManualFulfillmentQueue } from '@/modules/fulfillment/queries'
import {
  markDeliveredAction,
  markFailedAction,
  markIssuedAction,
} from './actions'

export const dynamic = 'force-dynamic'

function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default async function FulfillmentQueuePage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId
  if (!employeeId) redirect('/auth/signin')
  if (!(await isPeopleTeamRep(employeeId))) notFound()

  const items = await listManualFulfillmentQueue()

  const colombia = items.filter((i) => i.nominee.geo === 'Colombia')
  const usCashPending = items.filter(
    (i) =>
      i.reward.delivery_mechanism === 'justworks_csv' &&
      (i.reward.status === 'selected' || i.reward.status === 'issued')
  )
  const indiaCash = items.filter(
    (i) => i.reward.delivery_mechanism === 'zoho_payroll'
  )
  const custom = items.filter(
    (i) => i.reward.reward_type === 'custom' && i.nominee.geo !== 'Colombia'
  )
  const failed = items.filter((i) => i.reward.status === 'failed')

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <header className="mb-8">
        <Link href="/people-ops" className="text-sm text-gray-500 hover:text-gray-700">
          ← People Ops
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">
          Manual fulfillment queue
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {items.length === 0
            ? 'Nothing waiting right now.'
            : `${items.length} reward${items.length === 1 ? '' : 's'} needing People Ops action.`}
        </p>
      </header>

      {usCashPending.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              US cash · JustWorks batch ({usCashPending.length})
            </h2>
            <Link
              href="/api/people-ops/exports/justworks-cash"
              className="text-xs text-gray-700 underline underline-offset-2 hover:text-gray-900"
            >
              Download CSV
            </Link>
          </div>
          <Group items={usCashPending} />
        </section>
      )}

      {indiaCash.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
            India cash · Zoho payroll ({indiaCash.length})
          </h2>
          <Group items={indiaCash} showInstruction="zoho" />
        </section>
      )}

      {colombia.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
            Colombia · manual ({colombia.length})
          </h2>
          <Group items={colombia} showInstruction="colombia" />
        </section>
      )}

      {custom.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
            Custom rewards · manual sourcing ({custom.length})
          </h2>
          <Group items={custom} />
        </section>
      )}

      {failed.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-red-700">
            Failed · needs People Ops attention ({failed.length})
          </h2>
          <Group items={failed} />
        </section>
      )}
    </main>
  )
}

function Group({
  items,
  showInstruction,
}: {
  items: Awaited<ReturnType<typeof listManualFulfillmentQueue>>
  showInstruction?: 'zoho' | 'colombia'
}) {
  return (
    <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
      {items.map((item) => (
        <div key={item.reward.id} className="p-4 text-sm">
          <div className="flex items-baseline justify-between">
            <p className="font-medium text-gray-900">
              {item.nominee.name} ·{' '}
              <span className="text-gray-500">
                {item.nominee.employment_type === 'contractor'
                  ? 'contractor'
                  : 'employee'}
                , {item.nominee.geo}
              </span>
            </p>
            <span className="text-xs uppercase text-gray-500">
              {item.reward.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {item.reward.reward_type}
            {item.reward.vendor ? ` · ${item.reward.vendor}` : ''} · ${' '}
            {fmtUsd(item.reward.amount_usd)}
          </p>
          <p className="mt-2 text-xs text-gray-600">
            {item.value?.name} · "{item.nomination.behavior_text.slice(0, 120)}
            {item.nomination.behavior_text.length > 120 ? '…' : ''}"
          </p>
          {showInstruction === 'zoho' && (
            <pre className="mt-2 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs text-gray-700">
              {`Payee: ${item.nominee.name} (${item.nominee.email})
Employee ID: ${item.nominee.id}
Net to recipient: $${item.reward.amount_usd.toFixed(2)} USD
Reward ID: ${item.reward.id}
Nomination: ${item.reward.nomination_id}`}
            </pre>
          )}
          {showInstruction === 'colombia' && (
            <pre className="mt-2 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs text-gray-700">
              {`Payee: ${item.nominee.name} (${item.nominee.email})
Employee ID: ${item.nominee.id}
${
  item.nominee.employment_type === 'contractor'
    ? 'Contractor — contractor payment path (coordinate with Finance).'
    : 'Employee — Zoho payroll (coordinate with Finance).'
}
Reward: ${item.reward.reward_type} · $${item.reward.amount_usd.toFixed(2)} USD
Reward ID: ${item.reward.id}
Nomination: ${item.reward.nomination_id}`}
            </pre>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {item.reward.status === 'selected' && (
              <form action={markIssuedAction}>
                <input type="hidden" name="reward_id" value={item.reward.id} />
                <button
                  type="submit"
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Mark issued
                </button>
              </form>
            )}
            {item.reward.status === 'issued' && (
              <form action={markDeliveredAction}>
                <input type="hidden" name="reward_id" value={item.reward.id} />
                <button
                  type="submit"
                  className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800"
                >
                  Mark delivered
                </button>
              </form>
            )}
            {(item.reward.status === 'selected' ||
              item.reward.status === 'issued') && (
              <details className="inline-block">
                <summary className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">
                  Mark failed
                </summary>
                <form action={markFailedAction} className="mt-2 space-y-1">
                  <input type="hidden" name="reward_id" value={item.reward.id} />
                  <input
                    name="reason"
                    required
                    placeholder="Reason"
                    className="w-48 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    Confirm fail
                  </button>
                </form>
              </details>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
