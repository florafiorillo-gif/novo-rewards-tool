/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  buildPostAssembly,
  buildPostBlocks,
  buildPostFallbackText,
  sendMadeItHappenPost,
  TIER_3_ACCENT,
  THREAD_STARTER,
} from '@/modules/communication/post'
import { resetMockNominations } from '@/modules/nominations/mock-store'
import { resetMockApprovalActions } from '@/modules/approvals/service'
import { resetMockRewards } from '@/modules/rewards/mock-store'
import { resetMockRecognitionOverrides, setRecognitionPreference } from '@/modules/employees/service'
import { createNomination } from '@/modules/nominations/service'
import { approveNomination } from '@/modules/approvals/service'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'
import type { NominationRecord } from '@/modules/nominations/types'
import type { Employee } from '@/modules/employees/types'

function nom(overrides: Partial<NominationRecord> = {}): NominationRecord {
  const now = new Date()
  return {
    id: 'nom_test',
    nominator_id: 'emp_007',
    nominee_id: 'emp_006',
    value_id: 'val_run_for_the_bus',
    behavior_text: 'Rewrote the migration over the weekend.',
    outcome_text: 'Saved the launch window.',
    evidence_links: [],
    submitted_at: now,
    current_tier: 1,
    status: 'approved',
    current_approver_id: null,
    team_award_group_id: null,
    duplicate_of_id: null,
    tier2_dept_head_id: null,
    tier2_people_team_rep_id: null,
    urgent: false,
    last_nudge_at: null,
    last_escalation_at: null,
    approved_at: now,
    denied_at: null,
    acknowledged_at: null,
    post_fired_at: null,
    post_message_ts: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

const alex = MOCK_EMPLOYEES.find((e) => e.id === 'emp_006') as Employee
const jamie = MOCK_EMPLOYEES.find((e) => e.id === 'emp_007') as Employee
const sarah = MOCK_EMPLOYEES.find((e) => e.id === 'emp_005') as Employee // VP Engineering, dept head
const rares = MOCK_EMPLOYEES.find((e) => e.id === 'emp_001') as Employee

beforeEach(() => {
  resetMockNominations()
  resetMockApprovalActions()
  resetMockRewards()
  resetMockRecognitionOverrides()
})

describe('buildPostAssembly (spec §9.6 format)', () => {
  it('tier 1: no outcome line, no accent', () => {
    const a = buildPostAssembly({
      nomination: nom({ current_tier: 1 }),
      nominator: jamie,
      nominee: alex,
      value_name: 'Run for the Bus',
      approver: sarah,
      scope_note_text: 'Exactly the kind of ownership I want to see more of.',
    })
    expect(a.header).toBe('*Alex Rivera* | *Run for the Bus*')
    expect(a.header).not.toContain(TIER_3_ACCENT)
    expect(a.outcome).toBeNull()
    expect(a.scope_note_line).toContain('— Sarah Chen, VP Engineering')
    expect(a.thread_starter).toBe(THREAD_STARTER)
  })

  it('tier 2: outcome appended + dept-lead role attribution', () => {
    const a = buildPostAssembly({
      nomination: nom({ current_tier: 2 }),
      nominator: jamie,
      nominee: alex,
      value_name: 'Intellectual Honesty',
      approver: sarah, // dept head, Engineering
      scope_note_text: 'A good judgment call under pressure.',
    })
    expect(a.outcome).toBe('Saved the launch window.')
    expect(a.scope_note_line).toContain('— Sarah Chen, Engineering lead')
  })

  it('tier 3: ✨ accent + committee attribution', () => {
    const a = buildPostAssembly({
      nomination: nom({ current_tier: 3 }),
      nominator: jamie,
      nominee: alex,
      value_name: 'Hierarchy Is Not Authority',
      approver: rares,
      scope_note_text: 'A defining example for everyone at Novo.',
    })
    expect(a.header.startsWith(TIER_3_ACCENT)).toBe(true)
    expect(a.scope_note_line).toContain('— Rares Crisan, on behalf of the committee')
  })

  it('no scope_note_text → no scope_note_line', () => {
    const a = buildPostAssembly({
      nomination: nom({ current_tier: 1 }),
      nominator: jamie,
      nominee: alex,
      value_name: 'Run for the Bus',
      approver: sarah,
      scope_note_text: '',
    })
    expect(a.scope_note_line).toBeNull()
  })

  it('blocks include header, quote, outcome (T2+), scope note, thread starter', () => {
    const a = buildPostAssembly({
      nomination: nom({ current_tier: 2 }),
      nominator: jamie,
      nominee: alex,
      value_name: 'Intellectual Honesty',
      approver: sarah,
      scope_note_text: 'Caught it early.',
    })
    const blocks = buildPostBlocks(a)
    // header + quote + outcome + scope note + thread starter = 5 sections
    expect(blocks.length).toBe(5)
    expect(blocks[blocks.length - 1].text.text).toContain(THREAD_STARTER)
  })

  it('fallback text omits markdown asterisks', () => {
    const a = buildPostAssembly({
      nomination: nom({ current_tier: 3 }),
      nominator: jamie,
      nominee: alex,
      value_name: 'Run for the Bus',
      approver: rares,
      scope_note_text: 'A defining moment.',
    })
    const txt = buildPostFallbackText(a)
    expect(txt).not.toMatch(/\*/)
    expect(txt).toContain('Alex Rivera')
    expect(txt).toContain('Run for the Bus')
  })
})

describe('sendMadeItHappenPost — visibility branches (spec §11.5)', () => {
  async function seedFullyApproved(nominee_id = 'emp_006') {
    const created = await createNomination(
      {
        nominee_id,
        value_id: 'val_run_for_the_bus',
        behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
        outcome_text: 'We saved the launch window and avoided a partial rollback.',
        evidence_links: [],
      },
      'emp_007'
    )
    if (!created.ok) throw new Error('seed failed')
    const approved = await approveNomination({
      nomination_id: created.nomination.id,
      actor_id: 'emp_005',
    })
    if (!approved.ok) throw new Error('approve failed')
    return approved.nomination
  }

  it('recipient_preference=private → outcome skipped_private', async () => {
    const nomination = await seedFullyApproved('emp_006')
    await setRecognitionPreference('emp_006', 'private')
    const res = await sendMadeItHappenPost(nomination)
    expect(res.outcome).toBe('skipped_private')
    expect(res.message_ts).toBeNull()
  })

  it('recipient_preference=team_only → outcome skipped_team_only (v1 fallback)', async () => {
    const nomination = await seedFullyApproved('emp_006')
    await setRecognitionPreference('emp_006', 'team_only')
    const res = await sendMadeItHappenPost(nomination)
    expect(res.outcome).toBe('skipped_team_only')
    expect(res.message_ts).toBeNull()
  })

  it('recipient_preference=public but Slack unconfigured → skipped_unconfigured', async () => {
    const nomination = await seedFullyApproved('emp_006')
    delete process.env.SLACK_MADE_IT_HAPPEN_CHANNEL_ID
    delete process.env.SLACK_BOT_TOKEN
    const res = await sendMadeItHappenPost(nomination)
    expect(res.outcome).toBe('skipped_unconfigured')
  })

  it('context missing (unknown nominee) → skipped_missing_context', async () => {
    const dangling = nom({ nominee_id: 'emp_does_not_exist' })
    const res = await sendMadeItHappenPost(dangling)
    expect(res.outcome).toBe('skipped_missing_context')
  })
})
