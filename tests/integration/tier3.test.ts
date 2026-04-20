/** @jest-environment node */
import { db } from '@/lib/db'
import { proposeUpgrade } from '@/modules/approvals/service'
import { decideCommittee } from '@/modules/committee/service'
import { createNomination } from '@/modules/nominations/service'
import {
  describeIntegration,
  disconnect,
  resetDb,
  seedFixtures,
} from './setup'

describeIntegration('Tier 3 committee decision E2E (Prisma)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedFixtures()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('escalates to committee queue and persists a CommitteeDecision on approve', async () => {
    const created = await createNomination(
      {
        nominee_id: 'emp_006',
        value_id: 'val_run_for_the_bus',
        behavior_text:
          'Led an incident response that shifted company strategy on resilience.',
        outcome_text:
          'Company roadmap revised and two new processes adopted across all geos.',
        evidence_links: [],
      },
      'emp_007'
    )
    if (!created.ok) throw new Error('create failed')

    // Sarah escalates directly 1 → 3 with urgent flag.
    const up = await proposeUpgrade({
      nomination_id: created.nomination.id,
      actor_id: 'emp_005',
      to_tier: 3,
      reasoning:
        'Strategic impact across geos — committee-level recognition warranted.',
      urgent: true,
    })
    expect(up.ok).toBe(true)
    if (!up.ok) return

    const queued = await db.nomination.findUniqueOrThrow({
      where: { id: created.nomination.id },
    })
    expect(queued.current_tier).toBe(3)
    expect(queued.status).toBe('under_review')
    expect(queued.urgent).toBe(true)
    expect(queued.current_approver_id).toBeNull()

    // Rares (emp_001, committee member) records the decision.
    const decision = await decideCommittee({
      nomination_id: created.nomination.id,
      actor_id: 'emp_001',
      decision: 'approve',
      decision_log_text:
        'Clear strategic impact. Flora and Rares concurring; delivery by Rares.',
    })
    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    expect(decision.outcome).toBe('approved')

    const after = await db.nomination.findUniqueOrThrow({
      where: { id: created.nomination.id },
    })
    expect(after.status).toBe('approved')
    expect(after.approved_at).toBeInstanceOf(Date)

    const committeeRows = await db.committeeDecision.findMany({
      where: { nomination_id: created.nomination.id },
    })
    expect(committeeRows).toHaveLength(1)
    expect(committeeRows[0].decision).toBe('approve')
    expect(committeeRows[0].committee_members).toContain('emp_001')

    // The decide path also mirrors into ApprovalAction for the audit trail.
    const approvalActions = await db.approvalAction.findMany({
      where: { nomination_id: created.nomination.id },
      orderBy: { created_at: 'asc' },
    })
    expect(
      approvalActions.some(
        (a) => a.action === 'approve' && a.actor_id === 'emp_001'
      )
    ).toBe(true)
  })
})
