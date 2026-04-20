/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  activatePeriod,
  approvePeriod,
  closePeriod,
  createPeriod,
  getActivePeriod,
  getPeriod,
} from '@/modules/budget/periods'
import { resetMockBudget } from '@/modules/budget/mock-store'

beforeEach(() => {
  resetMockBudget()
})

describe('createPeriod', () => {
  it('creates a draft period with defaults', async () => {
    const r = await createPeriod({
      period_label: 'Q2 2026',
      start_date: new Date('2026-04-01'),
      end_date: new Date('2026-06-30'),
      total_allocation_usd: 100_000,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.period.status).toBe('draft')
    expect(r.period.approved_by).toEqual([])
    expect(r.period.allocation_config).toBeTruthy()
  })

  it('rejects start_date >= end_date', async () => {
    const r = await createPeriod({
      period_label: 'bad',
      start_date: new Date('2026-07-01'),
      end_date: new Date('2026-04-01'),
      total_allocation_usd: 1000,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('invalid_dates')
  })

  it('rejects non-positive amount', async () => {
    const r = await createPeriod({
      period_label: 'bad',
      start_date: new Date('2026-04-01'),
      end_date: new Date('2026-06-30'),
      total_allocation_usd: 0,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('invalid_amount')
  })
})

describe('approvePeriod', () => {
  async function seedDraft() {
    const r = await createPeriod({
      period_label: 'Q2 2026',
      start_date: new Date('2026-04-01'),
      end_date: new Date('2026-06-30'),
      total_allocation_usd: 100_000,
    })
    if (!r.ok) throw new Error('seed failed')
    return r.period
  }

  it('requires a committee member actor', async () => {
    const p = await seedDraft()
    const r = await approvePeriod(p.id, 'emp_006') // Alex, not committee
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('forbidden')
  })

  it('stays draft until all committee members approve', async () => {
    const p = await seedDraft()
    // Rares approves.
    const first = await approvePeriod(p.id, 'emp_001')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.period.status).toBe('draft')
    expect(first.period.approved_by).toContain('emp_001')

    // Flora approves → both committee members signed → status flips.
    const second = await approvePeriod(p.id, 'emp_002')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.period.status).toBe('approved')
    expect(second.period.approved_at).toBeInstanceOf(Date)
  })

  it('is idempotent when the same committee member approves twice', async () => {
    const p = await seedDraft()
    await approvePeriod(p.id, 'emp_001')
    const again = await approvePeriod(p.id, 'emp_001')
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.period.approved_by.filter((id) => id === 'emp_001')).toHaveLength(1)
  })
})

describe('closePeriod (spec §10.4)', () => {
  async function seedActive() {
    const p = (await createPeriod({
      period_label: 'Q2',
      start_date: new Date('2026-04-01'),
      end_date: new Date('2026-06-30'),
      total_allocation_usd: 100_000,
    })) as { ok: true; period: { id: string } }
    await approvePeriod(p.period.id, 'emp_001')
    await approvePeriod(p.period.id, 'emp_002')
    const activated = await activatePeriod(p.period.id)
    if (!activated.ok) throw new Error('activate failed')
    return activated.period
  }

  it('sets status=closed and stamps closed_at for the 14-day grace', async () => {
    const period = await seedActive()
    const closed = await closePeriod(period.id, 'emp_001')
    expect(closed.ok).toBe(true)
    if (!closed.ok) return
    expect(closed.period.status).toBe('closed')
    expect(closed.period.closed_at).toBeInstanceOf(Date)
  })

  it('refuses close from a non-committee actor', async () => {
    const period = await seedActive()
    const r = await closePeriod(period.id, 'emp_006')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('forbidden')
  })
})

describe('getActivePeriod', () => {
  it('returns the period whose date range covers now', async () => {
    const r = await createPeriod({
      period_label: 'Q2 2026',
      start_date: new Date('2026-04-01'),
      end_date: new Date('2026-06-30'),
      total_allocation_usd: 100_000,
    })
    if (!r.ok) throw new Error('seed failed')
    await approvePeriod(r.period.id, 'emp_001')
    await approvePeriod(r.period.id, 'emp_002')
    await activatePeriod(r.period.id)

    const active = await getActivePeriod(new Date('2026-05-15'))
    expect(active?.id).toBe(r.period.id)
  })

  it('returns null when today falls outside any active period', async () => {
    const active = await getActivePeriod(new Date('2026-08-01'))
    expect(active).toBeNull()
  })

  it('returns null for approved-but-not-yet-active periods', async () => {
    const r = await createPeriod({
      period_label: 'Q3 2026',
      start_date: new Date('2026-07-01'),
      end_date: new Date('2026-09-30'),
      total_allocation_usd: 50_000,
    })
    if (!r.ok) throw new Error('seed failed')
    await approvePeriod(r.period.id, 'emp_001')
    await approvePeriod(r.period.id, 'emp_002')
    // Not activated.
    const active = await getActivePeriod(new Date('2026-08-15'))
    expect(active).toBeNull()
  })
})

// Exercise the getPeriod read helper (used by the detail page).
describe('getPeriod', () => {
  it('returns null for unknown ids', async () => {
    const p = await getPeriod('bp_does_not_exist')
    expect(p).toBeNull()
  })
})
