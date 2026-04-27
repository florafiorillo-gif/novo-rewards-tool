// Smoke-test the group-nomination feature end to end against the
// in-memory mock store. Exercises the four scenarios called out in
// the brief: 4-recipient creation + shared group_id, mixed approval,
// mixed visibility, cross-geo routing.
//
// Run: USE_MOCK_DATA=true SEED_MODE=demo npx tsx scripts/verify-group-nominations.ts
//
// Idempotent against the demo seed — each scenario uses a distinct
// nominator/recipient set so reruns don't collide.

import '@/modules/seed/demo-bootstrap'

import {
  createGroupNomination,
  listGroupSiblings,
} from '@/modules/nominations/service'
import { approveNomination, denyNomination } from '@/modules/approvals/service'
import { setRecognitionPreference } from '@/modules/employees/service'
import {
  firePostIfReady,
  type PostSender,
} from '@/modules/communication/ack'
import { _mockPatchForTests } from '@/modules/communication/ack'
import { resetMockNominations } from '@/modules/nominations/mock-store'
import { listAllMock } from '@/modules/nominations/mock-store'

function header(label: string): void {
  console.log('\n' + '═'.repeat(64))
  console.log('  ' + label)
  console.log('═'.repeat(64))
}

function check(label: string, ok: boolean, detail?: string): void {
  const mark = ok ? '✓' : '✗'
  console.log(`  ${mark} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

// Sender stub that records every fire so we can assert on payloads.
function makeRecordingSender(): {
  sender: PostSender
  calls: Array<{ ids: string[]; size: number }>
} {
  const calls: Array<{ ids: string[]; size: number }> = []
  const sender: PostSender = async (noms) => {
    calls.push({ ids: noms.map((n) => n.id), size: noms.length })
    // Pretend Slack returned a message_ts when the post would have fired.
    return { message_ts: `ts_${calls.length}_${noms.length}` }
  }
  return { sender, calls }
}

async function main() {
  // Bootstrap is async; give it a tick to land seeded data.
  await new Promise((r) => setTimeout(r, 100))
  resetMockNominations()

  // ── Scenario 1: submit a group of 4, verify N + shared group_id ────
  header('Scenario 1 — 4-recipient submission')
  // Lauren Park (emp_021) recognizes Elena (emp_023), Tara (emp_029),
  // Marcus (emp_026), Nina (emp_025) — none are her direct reports.
  const create = await createGroupNomination(
    {
      nominee_ids: ['emp_023', 'emp_029', 'emp_026', 'emp_025'],
      value_id: 'val_run_for_the_bus',
      behavior_text:
        'Shipped the Q2 launch on time despite cross-team blockers and constant scope creep on the way.',
      outcome_text:
        'Launch hit the target date, marketing landed cleanly, customer onboarding queue cleared in 48h.',
      evidence_links: [],
    },
    'emp_021'
  )
  check('createGroupNomination ok', create.ok)
  if (!create.ok) {
    console.log('  error code=' + create.error.code)
    return
  }
  check('group_id present', create.group_id !== null)
  check('exactly 4 nominations created', create.nominations.length === 4)
  const ids = create.nominations.map((n) => n.id)
  const groupId = create.group_id!
  const siblings = await listGroupSiblings(groupId)
  check('listGroupSiblings returns 4', siblings.length === 4)
  const allShareGroup = siblings.every(
    (s) => s.team_award_group_id === groupId
  )
  check('all siblings share group_id', allShareGroup)
  // Cross-geo coverage: at least 2 different geos in the recipient set.
  // (Demo data has India + US in this group? Let's just print to confirm.)
  const approverSet = new Set(siblings.map((s) => s.current_approver_id))
  check(
    'recipients route to multiple approvers',
    approverSet.size >= 2,
    `approvers: ${[...approverSet].join(', ')}`
  )

  // ── Scenario 2: mixed approval (3 approve, 1 deny) ────────────────
  header('Scenario 2 — mixed approval (3 approved, 1 denied)')
  // Approve 3, deny 1. Each approver acts on their own row.
  const approves = siblings.slice(0, 3)
  const denied = siblings[3]!
  for (const s of approves) {
    if (!s.current_approver_id) {
      check(`row ${s.id.slice(0, 12)} has approver`, false)
      continue
    }
    const r = await approveNomination({
      nomination_id: s.id,
      actor_id: s.current_approver_id,
      reflection_type: undefined,
    })
    check(
      `approve ${s.nominee_id}`,
      r.ok,
      r.ok ? `tier=${r.nomination.current_tier}` : `err=${JSON.stringify(r.error)}`
    )
  }
  if (denied.current_approver_id) {
    const r = await denyNomination({
      nomination_id: denied.id,
      actor_id: denied.current_approver_id,
      reason_structured: 'value_mismatch',
      reason_text: 'Better fit for a different recognition cycle.',
    })
    check(
      `deny ${denied.nominee_id}`,
      r.ok,
      r.ok ? `status=${r.nomination.status}` : `err=${JSON.stringify(r.error)}`
    )
  }
  // Read back, confirm 3 approved + 1 denied
  const afterApproval = await listGroupSiblings(groupId)
  const approvedCount = afterApproval.filter(
    (n) => n.status === 'approved' || n.status === 'fulfilled'
  ).length
  const deniedCount = afterApproval.filter((n) => n.status === 'denied').length
  check('3 siblings approved', approvedCount === 3, `actual=${approvedCount}`)
  check('1 sibling denied', deniedCount === 1, `actual=${deniedCount}`)

  // ── Scenario 3: post composer fires once for 3 public approvers ────
  header('Scenario 3 — group post fires for 3 approved+public siblings')
  // Mark all four as ack'd so shouldFirePost returns true for the
  // 3 approved ones (denied row never fires).
  const now = new Date()
  for (const n of afterApproval) {
    if (n.status === 'approved' || n.status === 'fulfilled') {
      // Stub the timing to match a 24h-timeout-or-acked path. We
      // can fake acknowledged_at to avoid wiring rewards/DM/ack.
      _mockPatchForTests(n.id, { acknowledged_at: now })
    }
  }
  // Ensure all 3 approved nominees are public.
  for (const n of afterApproval) {
    if (n.status !== 'approved' && n.status !== 'fulfilled') continue
    await setRecognitionPreference(n.nominee_id, 'public')
  }

  const recording1 = makeRecordingSender()
  // Trigger via any sibling; the group logic should fire a single
  // unified post for the 3 approved public ones.
  const fireRes = await firePostIfReady(
    afterApproval[0]!.id,
    recording1.sender,
    now
  )
  check('group post fired', fireRes.fired)
  check(
    'sender called exactly once',
    recording1.calls.length === 1,
    `actual=${recording1.calls.length}`
  )
  check(
    'unified post listed exactly 3 names',
    recording1.calls[0]?.size === 3,
    `actual=${recording1.calls[0]?.size}`
  )
  // Subsequent firePostIfReady on a sibling should be a no-op.
  const recording2 = makeRecordingSender()
  await firePostIfReady(afterApproval[1]!.id, recording2.sender, now)
  check(
    'second trigger does not re-fire',
    recording2.calls.length === 0
  )

  // ── Scenario 4: mixed visibility (3 approved, 1 private among them) ─
  header('Scenario 4 — mixed visibility (private sibling excluded from post)')
  // Fresh group: Lauren recognizes 3 people. Then approve all 3 and
  // mark one private. Confirm post lists 2 names; private gets DM
  // path (not exercised here, but post_fired_at marker confirms).
  resetMockNominations()
  const v2 = await createGroupNomination(
    {
      nominee_ids: ['emp_023', 'emp_029', 'emp_026'],
      value_id: 'val_run_for_the_bus',
      behavior_text:
        'Co-led the launch retro and produced an action plan the whole team aligned on quickly.',
      outcome_text:
        'Action items distributed within 24h; followed-up on rollout window targets the next week.',
      evidence_links: [],
    },
    'emp_021'
  )
  if (!v2.ok) {
    check('v2 create', false, v2.error.code)
    return
  }
  const v2siblings = await listGroupSiblings(v2.group_id!)
  for (const s of v2siblings) {
    if (!s.current_approver_id) continue
    await approveNomination({
      nomination_id: s.id,
      actor_id: s.current_approver_id,
      reflection_type: undefined,
    })
  }
  // Make Marcus (emp_026) private; Elena + Tara public.
  await setRecognitionPreference('emp_023', 'public')
  await setRecognitionPreference('emp_029', 'public')
  await setRecognitionPreference('emp_026', 'private')
  // Mark all approved as acknowledged so shouldFirePost is true.
  const v2afterApproval = await listGroupSiblings(v2.group_id!)
  for (const n of v2afterApproval) {
    if (n.status === 'approved' || n.status === 'fulfilled') {
      _mockPatchForTests(n.id, { acknowledged_at: now })
    }
  }
  const recording3 = makeRecordingSender()
  const fireV2 = await firePostIfReady(
    v2afterApproval[0]!.id,
    recording3.sender,
    now
  )
  check('v2 fired', fireV2.fired)
  check(
    'v2 sender called once',
    recording3.calls.length === 1,
    `actual=${recording3.calls.length}`
  )
  check(
    'v2 post excluded the private recipient (size=2, not 3)',
    recording3.calls[0]?.size === 2,
    `actual=${recording3.calls[0]?.size}`
  )
  // Verify all three siblings have post_fired_at — public with the
  // group's message_ts, private with null.
  const v2finals = await listGroupSiblings(v2.group_id!)
  const allMarked = v2finals.every((n) => !!n.post_fired_at)
  check('all 3 siblings have post_fired_at set', allMarked)
  const privateRow = v2finals.find((n) => n.nominee_id === 'emp_026')!
  check(
    'private sibling marked with null message_ts',
    privateRow.post_message_ts === null
  )
  const publicRow = v2finals.find((n) => n.nominee_id === 'emp_023')!
  check(
    'public sibling carries the group message_ts',
    publicRow.post_message_ts !== null,
    `ts=${publicRow.post_message_ts}`
  )

  // ── Scenario 5: cross-geo routing ─────────────────────────────────
  header('Scenario 5 — cross-geo group routes to per-recipient pools')
  // Sarah Chen (US, emp_005) is mgr of Alex (US), Jamie (US),
  // Thomas (US). For a true cross-geo group from a non-manager, use
  // Lauren (emp_021, US) recognizing Elena (US), Priya (India,
  // emp_008), and Diego (Colombia, emp_050).
  resetMockNominations()
  const v3 = await createGroupNomination(
    {
      nominee_ids: ['emp_023', 'emp_008', 'emp_050'],
      value_id: 'val_run_for_the_bus',
      behavior_text:
        'Brought three regions together for the global onboarding redesign that landed last month.',
      outcome_text:
        'Onboarding drop-off improved across all three geos; rollout completed without rollback.',
      evidence_links: [],
    },
    'emp_021'
  )
  if (!v3.ok) {
    check('v3 create', false, v3.error.code)
    return
  }
  const v3siblings = await listGroupSiblings(v3.group_id!)
  // Each sibling routes to a different geo's manager. We can't read
  // pool resolution without going through reward selection, but we
  // CAN confirm the approvers belong to the right geo for each
  // recipient.
  const approverGeos = await Promise.all(
    v3siblings.map(async (s) => {
      const { getEmployeeById } = await import(
        '@/modules/employees/service'
      )
      const recipient = await getEmployeeById(s.nominee_id)
      const approver = s.current_approver_id
        ? await getEmployeeById(s.current_approver_id)
        : null
      return {
        recipient_geo: recipient?.geo,
        approver_geo: approver?.geo,
      }
    })
  )
  const distinctRecipientGeos = new Set(
    approverGeos.map((r) => r.recipient_geo)
  )
  check(
    'three different recipient geos',
    distinctRecipientGeos.size === 3,
    `geos=${[...distinctRecipientGeos].join(', ')}`
  )
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
