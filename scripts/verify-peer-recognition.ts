// Smoke-test peer recognition end to end against the in-memory mock
// store. Covers the role-combination matrix from the brief plus the
// frequency cap and dashboard surfacing.
//
// Run: USE_MOCK_DATA=true SEED_MODE=demo npx tsx scripts/verify-peer-recognition.ts
//
// Idempotent: resets the nomination store at start so re-running
// yields the same scenario outcomes.

import '@/modules/seed/demo-bootstrap'

import {
  createPeerNomination,
  countPeerNominationsBetween,
} from '@/modules/nominations/service'
import {
  PEER_FREQUENCY_CAP,
  PEER_TIER,
  type CreatePeerNominationResult,
} from '@/modules/nominations/types'
import { resetMockNominations } from '@/modules/nominations/mock-store'
import { getRecognitionFeed } from '@/modules/dashboard/recognition-feed'
import { getRecipientDashboardView } from '@/modules/dashboard/recipient-view'
import { setRecognitionPreference } from '@/modules/employees/service'

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

// Common narrative payload — long enough to clear the 30-char min.
function story(extra = ''): {
  value_id: string
  behavior_text: string
  outcome_text: string
} {
  return {
    value_id: 'val_run_for_the_bus',
    behavior_text:
      'Stayed late to unblock the rollout last Thursday and walked the doc through line by line.' +
      extra,
    outcome_text:
      'Engineering shipped the next morning without rolling back the migration plan we agreed on.' +
      extra,
  }
}

function expectOk(
  label: string,
  result: CreatePeerNominationResult
): result is Extract<CreatePeerNominationResult, { ok: true }> {
  if (result.ok) {
    check(label, true, `nom_id=${result.nomination.id.slice(0, 12)}`)
    return true
  }
  check(label, false, `unexpected error=${result.error.code}`)
  return false
}

function expectError(
  label: string,
  result: CreatePeerNominationResult,
  expectedCode: string
): void {
  if (result.ok) {
    check(label, false, `expected ${expectedCode}, got ok`)
    return
  }
  const got = result.error.code
  check(label, got === expectedCode, `code=${got}`)
}

async function main() {
  // Bootstrap is async; give it a tick to land seeded data.
  await new Promise((r) => setTimeout(r, 100))
  resetMockNominations()

  // Reference org chart (demo seed):
  //   emp_006 Jimi Stratocaster (IC)     mgr=emp_005 (Stevie Synthesizer, VP Eng)
  //   emp_007 Janis Distortion  (IC)     mgr=emp_005 (same team as Jimi)
  //   emp_026 Ringo Sticks      (IC)     mgr=emp_020 (Bob Harmonica, Head of Product)
  //   emp_005 Stevie Synthesizer (manager) mgr=emp_001 (Miles, CEO)
  //   emp_020 Bob Harmonica      (manager) mgr=emp_001 (peer manager to Stevie)
  //   emp_001 Miles Trumpet      (CEO)    mgr=null

  // ── Scenario 1: IC → IC same team ────────────────────────────────
  header('Scenario 1 — role combinations (allowed cases)')

  const r1 = await createPeerNomination(
    { nominee_id: 'emp_007', ...story(' a1') },
    'emp_006'
  )
  expectOk('IC → IC (same team, lateral)', r1)

  const r2 = await createPeerNomination(
    { nominee_id: 'emp_026', ...story(' a2') },
    'emp_006'
  )
  expectOk('IC → IC (different team, lateral)', r2)

  // Manager → direct report (downward). Allowed: peer recognition has
  // no approval, so this isn't the self-approval path — it's just a
  // shoutout from a manager to someone who reports to them.
  const r3 = await createPeerNomination(
    { nominee_id: 'emp_006', ...story(' a3') },
    'emp_005'
  )
  expectOk('Manager → direct report (downward)', r3)

  // Manager → peer manager (lateral, at the same level).
  const r4 = await createPeerNomination(
    { nominee_id: 'emp_020', ...story(' a4') },
    'emp_005'
  )
  expectOk('Manager → peer manager (lateral)', r4)

  // ── Scenario 2: org-direction blocks ────────────────────────────
  header('Scenario 2 — org-direction blocks (upward chain)')

  const b1 = await createPeerNomination(
    { nominee_id: 'emp_005', ...story(' b1') },
    'emp_006'
  )
  expectError('IC → their direct manager', b1, 'upward_chain')

  const b2 = await createPeerNomination(
    { nominee_id: 'emp_001', ...story(' b2') },
    'emp_006'
  )
  expectError("IC → manager's manager (CEO)", b2, 'upward_chain')

  const b3 = await createPeerNomination(
    { nominee_id: 'emp_001', ...story(' b3') },
    'emp_005'
  )
  expectError('Manager → their boss (CEO)', b3, 'upward_chain')

  // Self-nomination is also blocked, even though it's lateral by
  // definition. Spec §13.2 — same as the tiered flow.
  const b4 = await createPeerNomination(
    { nominee_id: 'emp_006', ...story(' b4') },
    'emp_006'
  )
  expectError('Self-nomination', b4, 'self_nomination')

  // ── Scenario 3: frequency cap ───────────────────────────────────
  header('Scenario 3 — per-pair frequency cap (3 / rolling 7 days)')
  // Reset so this scenario can count from zero deterministically.
  resetMockNominations()

  // Three submissions to the same nominee should succeed.
  for (let i = 1; i <= PEER_FREQUENCY_CAP; i++) {
    const r = await createPeerNomination(
      { nominee_id: 'emp_007', ...story(` c${i}`) },
      'emp_006'
    )
    expectOk(`Recognition #${i} of ${PEER_FREQUENCY_CAP}`, r)
  }

  const fourth = await createPeerNomination(
    { nominee_id: 'emp_007', ...story(' c4') },
    'emp_006'
  )
  expectError(
    `Recognition #${PEER_FREQUENCY_CAP + 1} (over cap)`,
    fourth,
    'frequency_cap'
  )

  const countAfter = await countPeerNominationsBetween('emp_006', 'emp_007')
  check(
    'Pair count matches cap',
    countAfter === PEER_FREQUENCY_CAP,
    `count=${countAfter}`
  )

  // Cap is per pair — recognizing a different teammate still works.
  const otherPair = await createPeerNomination(
    { nominee_id: 'emp_026', ...story(' c5') },
    'emp_006'
  )
  expectOk('Different nominee bypasses the cap', otherPair)

  // ── Scenario 4: dashboard + feed surfacing ───────────────────────
  header('Scenario 4 — feed and recipient dashboard surfacing')
  resetMockNominations()

  // Make the recipient public so the recognition feed shows them.
  await setRecognitionPreference('emp_007', 'public')
  const live = await createPeerNomination(
    { nominee_id: 'emp_007', ...story(' d1') },
    'emp_006'
  )
  if (!expectOk('Live peer recognition created', live)) return

  check(
    'Persisted at current_tier=PEER_TIER',
    live.nomination.current_tier === PEER_TIER,
    `tier=${live.nomination.current_tier}`
  )
  check(
    "Persisted with status='approved'",
    live.nomination.status === 'approved',
    `status=${live.nomination.status}`
  )
  check(
    'No approver assigned (current_approver_id null)',
    live.nomination.current_approver_id === null
  )
  check(
    'approved_at stamped',
    !!live.nomination.approved_at,
    String(live.nomination.approved_at)
  )

  // Public feed should include this row regardless of viewer.
  const feed = await getRecognitionFeed('emp_006', 50)
  const inFeed = feed.some((f) => f.nomination.id === live.nomination.id)
  check('Peer row visible in recognition feed', inFeed)

  // Recipient dashboard should count this in items + nominator's
  // given_count should bump.
  const recipientView = await getRecipientDashboardView('emp_007')
  const inRecipient = recipientView.items.some(
    (i) => i.nomination_id === live.nomination.id
  )
  check('Peer row visible in /dashboard/me for recipient', inRecipient)

  const nominatorView = await getRecipientDashboardView('emp_006')
  check(
    'Nominator given_count includes the peer row',
    nominatorView.given_count >= 1,
    `given_count=${nominatorView.given_count}`
  )

  // ── Scenario 5: existing tiered flow still ok ────────────────────
  header('Scenario 5 — existing tiered flow unchanged')
  // Defer-import to avoid a circular cost when the script kicks off.
  const { createNomination } = await import('@/modules/nominations/service')
  const tiered = await createNomination(
    { nominee_id: 'emp_007', ...story(' tier') },
    'emp_006'
  )
  check(
    'createNomination still returns tier 1, status submitted',
    tiered.ok &&
      tiered.nomination.current_tier === 1 &&
      tiered.nomination.status === 'submitted',
    tiered.ok
      ? `tier=${tiered.nomination.current_tier} status=${tiered.nomination.status}`
      : `error=${'error' in tiered ? tiered.error.code : 'unknown'}`
  )
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
