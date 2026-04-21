import type { Geo } from '@/modules/employees/types'

export type RewardType = 'cash' | 'gift_card' | 'experience' | 'l_and_d' | 'custom'

export interface CatalogItemRecord {
  id: string
  geo: Geo
  reward_type: RewardType
  vendor: string | null
  name: string
  description: string
  amount_usd: number
  active: boolean
  created_at: Date
  updated_at: Date
}

export interface CreateCatalogItemInput {
  geo: Geo
  reward_type: RewardType
  vendor?: string
  name: string
  description: string
  amount_usd: number
}

export type UpdateCatalogItemInput = Partial<
  Pick<
    CatalogItemRecord,
    'vendor' | 'name' | 'description' | 'amount_usd' | 'active'
  >
>

// Fixed tier ranges per spec §5. Exposed for reward-selection filters.
export const TIER_RANGES: Record<1 | 2 | 3, { min: number; max: number }> = {
  1: { min: 50, max: 250 },
  2: { min: 250, max: 2000 },
  3: { min: 2000, max: 5000 },
}
