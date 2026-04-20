/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  AUTO_DENY_THRESHOLD_MS,
  ESCALATION_THRESHOLD_MS,
  NUDGE_THRESHOLD_MS,
  runSlaSweep,
} from '@/modules/approvals/sla'
import { resetMockApprovalActions } from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import {
  findByIdMock,
  resetMockNominations,
  updateMock,
} from '@/modules/nominations/mock-store'

const baseInput = {
  value_id: 'val_run_for_the_bus',
  behavior_text: 'They rewrote the migration on a tight deadline and shipped it clean.',
  outcome_text: 'We saved the launch window and avoided a partial rollback.',
  evidence_links: [],
}

async function seedAndAge(msAgo: number) {
  const r = await createNomination(
    { ...baseInput, nominee_id: 'emp_006' },
    'emp_007'
  )
  if (!r.ok) throw new Error('seed')
  updateMock(r.nomination.id, {
    submitted_at: new Date(Date.now() - msAgo),
  })
  return r.nomination
}

beforeEach(() => {
  resetMockNominations()
  resetMockApprovalActions()
})

describe('runSlaSweep (spec §7.6)', () => {
  it('does not nudge before 72 hours', async () => {
    await seedAndAge(NUDGE_THRESHOLD_MS - 60 * 1000)
    const result = await runSlaSweep()
    expect(result.nudged).toHaveLength(0)
    expect(result.escalated).toHaveLength(0)
    expect(result.auto_denied).toHaveLength(0)
  })

  it('nudges at 72h if not already nudged', async () => {
    const nom = await seedAndAge(NUDGE_THRESHOLD_MS + 60 * 1000)
    const result = await runSlaSweep()
    expect(result.nudged).toContain(nom.id)
    const after = findByIdMock(nom.id)
    expect(after?.last_nudge_at).toBeInstanceOf(Date)
  })

  it('does not re-nudge on subsequent sweeps', async () => {
    const nom = await seedAndAge(NUDGE_THRESHOLD_MS + 60 * 1000)
    await runSlaSweep()
    const second = await runSlaSweep()
    expect(second.nudged).not.toContain(nom.id)
  })

  it('escalates at 7 days if not already escalated', async () => {
    const nom = await seedAndAge(ESCALATION_THRESHOLD_MS + 60 * 1000)
    const result = await runSlaSweep()
    expect(result.escalated).toContain(nom.id)
    const after = findByIdMock(nom.id)
    expect(after?.last_escalation_at).toBeInstanceOf(Date)
  })

  it('auto-denies at 21 days', async () => {
    const nom = await seedAndAge(AUTO_DENY_THRESHOLD_MS + 60 * 1000)
    const result = await runSlaSweep()
    expect(result.auto_denied).toContain(nom.id)
    const after = findByIdMock(nom.id)
    expect(after?.status).toBe('denied')
    expect(after?.denied_at).toBeInstanceOf(Date)
  })

  it('exempts Tier 3 nominations from all SLA actions', async () => {
    const nom = await seedAndAge(AUTO_DENY_THRESHOLD_MS + 60 * 1000)
    updateMock(nom.id, { current_tier: 3, status: 'under_review' })
    const result = await runSlaSweep()
    expect(result.auto_denied).not.toContain(nom.id)
    expect(result.escalated).not.toContain(nom.id)
    expect(result.nudged).not.toContain(nom.id)
  })
})
