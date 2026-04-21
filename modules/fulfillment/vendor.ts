import type { Geo } from '@/modules/employees/types'
import type { RewardType } from '@/modules/rewards/types'

// Abstraction per spec §8.1 + Phase 5 Q1. Real adapter (Tremendous or
// Tango, pending Finance selection) drops in later. Colombia routes
// around this entirely — all Colombia rewards are manual (spec §8.1).

export interface VendorIssueArgs {
  recipient_email: string
  recipient_name: string
  amount_usd: number
  geo: Geo
  reward_type: RewardType
  vendor_hint?: string // the catalog item's vendor, if any (Amazon, Rappi, etc.)
  note?: string
}

export interface VendorReceipt {
  vendor_reference_id: string
  issued_at: Date
  // Notes the adapter wants surfaced to People Ops (e.g. stub's "this was
  // simulated"). Not shown to the recipient.
  internal_note?: string
}

export interface VendorAdapter {
  name: string
  issueGiftCard(args: VendorIssueArgs): Promise<VendorReceipt>
  issueCash(args: VendorIssueArgs): Promise<VendorReceipt>
  issueExperience(args: VendorIssueArgs): Promise<VendorReceipt>
}
