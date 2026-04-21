/** @jest-environment node */
import {
  buildColombiaManualInstruction,
  buildJustWorksCsv,
  buildZohoPayrollInstruction,
  type CashPayoutRow,
} from '@/modules/fulfillment/exports'
import type { RewardRecord } from '@/modules/rewards/types'

const sampleRow: CashPayoutRow = {
  employee_id: 'emp_006',
  name: 'Alex Rivera',
  email: 'alex.rivera@novo.co',
  net_usd: 150,
  cost_usd: 214.29,
  nomination_id: 'nom_abc',
  reward_id: 'rew_xyz',
}

describe('buildJustWorksCsv', () => {
  it('emits header + rows', () => {
    const csv = buildJustWorksCsv([sampleRow])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe(
      'employee_id,employee_name,email,net_bonus_usd,program_cost_usd,memo'
    )
    expect(lines[1]).toContain('emp_006')
    expect(lines[1]).toContain('Alex Rivera')
    expect(lines[1]).toContain('150.00')
    expect(lines[1]).toContain('214.29')
  })

  it('quotes names containing commas', () => {
    const csv = buildJustWorksCsv([
      { ...sampleRow, name: 'Last, First' },
    ])
    expect(csv).toContain('"Last, First"')
  })

  it('emits just a header row when input is empty', () => {
    const csv = buildJustWorksCsv([])
    expect(csv.trim()).toBe(
      'employee_id,employee_name,email,net_bonus_usd,program_cost_usd,memo'
    )
  })
})

describe('buildZohoPayrollInstruction', () => {
  it('renders a paste-ready instruction', () => {
    const recipient = {
      id: 'emp_009',
      name: 'Arjun Patel',
      email: 'arjun.patel@novo.co',
    } as unknown as Parameters<typeof buildZohoPayrollInstruction>[0]['recipient']
    const reward = {
      amount_usd: 100,
      id: 'rew_1',
      nomination_id: 'nom_1',
    } as unknown as RewardRecord
    const out = buildZohoPayrollInstruction({ recipient, reward })
    expect(out).toContain('Arjun Patel')
    expect(out).toContain('$100.00')
    expect(out).toContain('rew_1')
  })
})

describe('buildColombiaManualInstruction', () => {
  it('distinguishes contractor vs employee payment paths (spec §8.1)', () => {
    const employee = {
      id: 'emp_e',
      name: 'Employee Name',
      email: 'emp@novo.co',
      employment_type: 'employee',
    } as unknown as Parameters<typeof buildColombiaManualInstruction>[0]['recipient']
    const contractor = {
      id: 'emp_c',
      name: 'Contractor Name',
      email: 'c@novo.co',
      employment_type: 'contractor',
    } as unknown as Parameters<typeof buildColombiaManualInstruction>[0]['recipient']
    const reward = {
      reward_type: 'gift_card',
      amount_usd: 75,
      id: 'rew_1',
      nomination_id: 'nom_1',
    } as unknown as RewardRecord

    const emp = buildColombiaManualInstruction({ recipient: employee, reward })
    expect(emp).toContain('Employee — Zoho payroll')

    const ct = buildColombiaManualInstruction({ recipient: contractor, reward })
    expect(ct).toContain('Contractor — use contractor payment path')
  })
})
