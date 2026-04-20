/** @jest-environment node */
import { db } from '@/lib/db'
import {
  approveNomination,
  proposeUpgrade,
} from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import {
  describeIntegration,
  disconnect,
  resetDb,
  seedFixtures,
} from './setup'

describeIntegration('Tier 2 two-approver E2E (Prisma)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedFixtures()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('snapshots both approvers, flips status only after the second approve', async () => {
    const created = await createNomination(
      {
        nominee_id: 'emp_006',
        value_id: 'val_run_for_the_bus',
        behavior_text:
          'Kept a cross-team initiative unblocked for three weeks of active vendor outages.',
        outcome_text:
          'Program stayed on track and the dependent team hit its own deadline.',
        evidence_links: [],
      },
      'emp_007'
    )
    if (!created.ok) throw new Error('create failed')

    // Sarah proposes upgrade from Tier 1 → Tier 2.
    const up = await proposeUpgrade({
      nomination_id: created.nomination.id,
      actor_id: 'emp_005',
      to_tier: 2,
      reasoning:
        'Sustained impact over multiple weeks; this is beyond a spot recognition.',
    })
    expect(up.ok).toBe(true)
    if (!up.ok) return

    const snap = await db.nomination.findUniqueOrThrow({
      where: { id: created.nomination.id },
    })
    expect(snap.current_tier).toBe(2)
    expect(snap.status).toBe('under_review')
    expect(snap.tier2_dept_head_id).toBe('emp_005') // Sarah, US Eng head
    expect(snap.tier2_people_team_rep_id).toBeTruthy()
    const repId = snap.tier2_people_team_rep_id!

    // First approver (dept head) — status stays under_review.
    const first = await approveNomination({
      nomination_id: created.nomination.id,
      actor_id: 'emp_005',
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.became_final).toBe(false)
    const mid = await db.nomination.findUniqueOrThrow({
      where: { id: created.nomination.id },
    })
    expect(mid.status).toBe('under_review')

    // Second approver (People team rep) — flips to approved.
    const second = await approveNomination({
      nomination_id: created.nomination.id,
      actor_id: repId,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.became_final).toBe(true)

    const final = await db.nomination.findUniqueOrThrow({
      where: { id: created.nomination.id },
    })
    expect(final.status).toBe('approved')
    expect(final.approved_at).toBeInstanceOf(Date)

    // Round-robin counter on the chosen rep incremented.
    const rep = await db.employee.findUniqueOrThrow({ where: { id: repId } })
    expect(rep.tier2_assignments_count).toBeGreaterThan(0)
  })
})
