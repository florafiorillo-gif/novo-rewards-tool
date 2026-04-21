import type { Employee } from '@/modules/employees/types'
import type { RewardRecord } from '@/modules/rewards/types'

// Spec §8.1 — cash bonus handoff to Finance.
// US → CSV that Finance uploads to JustWorks off-cycle payroll.
// India → text instruction People Ops passes to Finance for Zoho payroll.
// Colombia → People Ops coordinates with Finance case-by-case.
//
// Phase 5 ships the formatters; /people-ops/fulfillment renders + downloads.

export interface CashPayoutRow {
  employee_id: string
  name: string
  email: string
  net_usd: number
  cost_usd: number
  nomination_id: string
  reward_id: string
}

// JustWorks expected columns. Real field names to be confirmed with
// Finance; the current shape is what Novo's JustWorks admin uses for
// off-cycle bonuses. TODO when Finance confirms: rename if needed.
export function buildJustWorksCsv(rows: CashPayoutRow[]): string {
  const header = [
    'employee_id',
    'employee_name',
    'email',
    'net_bonus_usd',
    'program_cost_usd',
    'memo',
  ].join(',')
  const body = rows.map((r) =>
    [
      r.employee_id,
      quote(r.name),
      r.email,
      r.net_usd.toFixed(2),
      r.cost_usd.toFixed(2),
      quote(`Recognition bonus · nomination ${r.nomination_id}`),
    ].join(',')
  )
  return [header, ...body].join('\n') + '\n'
}

// India: Finance prefers a short human-readable instruction they paste
// into Zoho payroll. Generated per reward rather than batched — India's
// lower volume keeps this viable at v1.
export function buildZohoPayrollInstruction(args: {
  recipient: Employee
  reward: RewardRecord
}): string {
  const { recipient, reward } = args
  return [
    `Payee: ${recipient.name} (${recipient.email})`,
    `Employee ID: ${recipient.id}`,
    `Net to recipient: $${reward.amount_usd.toFixed(2)} USD`,
    `Reward ID: ${reward.id}`,
    `Nomination: ${reward.nomination_id}`,
    `Memo: Recognition bonus`,
  ].join('\n')
}

// Colombia manual instruction — same shape as India but calls out the
// employment-type split so People Ops can route contractors vs employees
// through the right Finance process (per spec §8.1 Colombia paragraph).
export function buildColombiaManualInstruction(args: {
  recipient: Employee
  reward: RewardRecord
}): string {
  const { recipient, reward } = args
  const employmentLine =
    recipient.employment_type === 'contractor'
      ? 'Contractor — use contractor payment path (coordinate with Finance).'
      : 'Employee — Zoho payroll (coordinate with Finance).'
  return [
    `Payee: ${recipient.name} (${recipient.email})`,
    `Employee ID: ${recipient.id}`,
    employmentLine,
    `Reward: ${reward.reward_type} · $${reward.amount_usd.toFixed(2)} USD`,
    `Reward ID: ${reward.id}`,
    `Nomination: ${reward.nomination_id}`,
  ].join('\n')
}

function quote(s: string): string {
  // Basic CSV quoting — escape double-quotes, wrap in quotes when the
  // value contains a comma or quote. Good enough for the small volume
  // Finance receives; upgrade if we ever batch thousands.
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}
