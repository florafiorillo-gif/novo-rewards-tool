// Smoke verification for the role-differentiated dashboard restructure.
// Runs under: USE_MOCK_DATA=true SEED_MODE=demo npx tsx scripts/verify-dashboards.ts
//
// For each of the four target users it reports: resolved role, which
// cards would render on the main dashboard, and the feed size. No auth,
// no HTTP — composer-level read of the same data the page reads.

import '@/modules/seed/demo-bootstrap'

import { getEmployeeByEmail } from '@/modules/employees/service'
import { resolveRole } from '@/modules/roles/resolver'
import { getManagerDashboardView } from '@/modules/dashboard/manager-view'
import { getDepartmentDashboardView } from '@/modules/dashboard/department-view'
import { getRecognitionFeed } from '@/modules/dashboard/recognition-feed'
import { getRecipientDashboardView } from '@/modules/dashboard/recipient-view'
import {
  buildProgramView,
  getPeopleTeamDashboardView,
} from '@/modules/dashboard/people-team-view'
import { listCommitteeQueue } from '@/modules/committee/service'
import { listManualFulfillmentQueue } from '@/modules/fulfillment/queries'
import { countDeniedInRange } from '@/modules/approvals/queries'
import { getDisplayablePeriod } from '@/modules/budget/periods'

const TARGETS = [
  'cat@novo.co', // committee + people_team
  'fox@novo.co', // manager + dept head
  'dog@novo.co', // committee + (CEO)
  'deer@novo.co', // employee-only
]

async function main() {
  // Give bootstrap's async seed a tick to finish before we read.
  await new Promise((r) => setTimeout(r, 100))

  for (const email of TARGETS) {
    console.log('\n' + '═'.repeat(60))
    console.log(`  ${email}`)
    console.log('═'.repeat(60))

    const emp = await getEmployeeByEmail(email)
    if (!emp) {
      console.log('  EMPLOYEE NOT FOUND')
      continue
    }
    console.log(`  ${emp.name} · ${emp.role_title} · ${emp.geo}`)

    const role = await resolveRole(emp.id)
    console.log(
      `  role: manager=${role.is_manager} dept_head=${role.is_department_head} people_team=${role.is_people_team} committee=${role.is_committee} employee_only=${role.is_employee_only}`
    )

    const [
      view,
      deptView,
      feed,
      recipientView,
      tier3Queue,
      fulfillmentQueue,
      programView,
      displayablePeriod,
    ] = await Promise.all([
      getManagerDashboardView(emp.id),
      getDepartmentDashboardView(emp.id),
      getRecognitionFeed(emp.id, 20),
      getRecipientDashboardView(emp.id),
      role.is_committee ? listCommitteeQueue(emp.id) : Promise.resolve([]),
      role.is_people_team ? listManualFulfillmentQueue() : Promise.resolve([]),
      role.is_people_team
        ? getPeopleTeamDashboardView(emp.id)
        : role.is_committee
          ? buildProgramView()
          : Promise.resolve(null),
      role.is_people_team || role.is_committee
        ? getDisplayablePeriod()
        : Promise.resolve(null),
    ])

    const deniedCount =
      role.is_people_team && displayablePeriod?.period
        ? await countDeniedInRange(
            displayablePeriod.period.start_date,
            displayablePeriod.period.end_date
          )
        : 0

    const totalPending = view.pending_tier1_count + deptView.pending_tier2_count
    const tier3Count = tier3Queue.length
    const tier3UrgentCount = tier3Queue.filter((q) => q.nomination.urgent).length

    console.log(`  feed items: ${feed.length}`)
    console.log('  sidebar cards:')
    if (role.is_employee_only) {
      console.log('    • Recognize CTA')
    }
    if (totalPending > 0) {
      console.log(
        `    • Waiting on you (${view.pending_tier1_count} T1, ${deptView.pending_tier2_count} T2)`
      )
    }
    if (role.is_committee) {
      console.log(
        `    • Tier 3 queue (${tier3Count} pending, ${tier3UrgentCount} urgent)`
      )
    }
    if (view.pool && view.period && view.pacing) {
      console.log(
        `    • Manager pool ($${view.pool.remaining_amount_usd} remaining · ${view.pacing})`
      )
    }
    if (deptView.dept_pool && deptView.dept_pacing) {
      console.log(
        `    • Department pool ($${deptView.dept_pool.remaining_amount_usd} remaining · ${deptView.dept_pacing})`
      )
    }
    const isAdmin = role.is_committee || role.is_people_team
    const hasAdminQueue =
      isAdmin &&
      (totalPending > 0 ||
        (role.is_people_team && fulfillmentQueue.length > 0) ||
        deniedCount > 0)
    if (hasAdminQueue) {
      console.log(
        `    • Your queue (approvals=${totalPending} fulfillment=${role.is_people_team ? fulfillmentQueue.length : 0} denials=${deniedCount})`
      )
    }
    if (role.is_committee && displayablePeriod?.period) {
      console.log(
        `    • Budget period status (${displayablePeriod.period.period_label}, in_grace=${displayablePeriod.in_grace})`
      )
    }
    if ((role.is_people_team || role.is_committee) && programView?.period) {
      const exc = programView.exceptions.length
      const sla = programView.sla_misses.length
      console.log(
        `    • Program health (exceptions=${exc}, sla_misses=${sla}) → ${role.is_committee ? '/leadership/dashboard' : '/people-ops/dashboard'}`
      )
    }
    const received = recipientView.items.length
    const given = recipientView.given_count
    if (!isAdmin && (received > 0 || given > 0)) {
      console.log(`    • Your activity (given=${given}, received=${received})`)
    }
  }

  console.log('\n' + '═'.repeat(60))
  console.log('  DONE')
  console.log('═'.repeat(60))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
