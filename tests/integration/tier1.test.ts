/** @jest-environment node */
import { db } from '@/lib/db'
import { approveNomination } from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import {
  describeIntegration,
  disconnect,
  resetDb,
  seedFixtures,
} from './setup'

describeIntegration('Tier 1 peer nomination E2E (Prisma)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedFixtures()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('routes to the nominee manager and writes approval state to Postgres', async () => {
    // Jamie (emp_007, Eng PM) nominates Alex (emp_006, Eng SWE).
    const created = await createNomination(
      {
        nominee_id: 'emp_006',
        value_id: 'val_run_for_the_bus',
        behavior_text:
          'Shipped the migration on a tight deadline after the reviewer was out.',
        outcome_text:
          'We saved the launch window and avoided a partial rollback.',
        evidence_links: [],
      },
      'emp_007'
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return

    // Persisted with the right routing.
    const row = await db.nomination.findUniqueOrThrow({
      where: { id: created.nomination.id },
    })
    expect(row.current_tier).toBe(1)
    expect(row.status).toBe('submitted')
    expect(row.current_approver_id).toBe('emp_005') // Sarah, Alex's manager

    // Sarah (the manager) approves.
    const approved = await approveNomination({
      nomination_id: created.nomination.id,
      actor_id: 'emp_005',
    })
    expect(approved.ok).toBe(true)
    if (!approved.ok) return
    expect(approved.became_final).toBe(true)

    const after = await db.nomination.findUniqueOrThrow({
      where: { id: created.nomination.id },
    })
    expect(after.status).toBe('approved')
    expect(after.approved_at).toBeInstanceOf(Date)

    const actions = await db.approvalAction.findMany({
      where: { nomination_id: created.nomination.id },
      orderBy: { created_at: 'asc' },
    })
    expect(actions).toHaveLength(1)
    expect(actions[0].action).toBe('approve')
    expect(actions[0].actor_id).toBe('emp_005')
  })
})
