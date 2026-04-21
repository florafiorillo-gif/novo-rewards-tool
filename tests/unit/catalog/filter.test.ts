/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import {
  createCatalogItem,
  listCatalogForSelection,
  updateCatalogItem,
} from '@/modules/catalog/service'
import { resetMockCatalog } from '@/modules/catalog/mock-store'

beforeEach(() => {
  resetMockCatalog()
})

describe('listCatalogForSelection', () => {
  it('filters by geo + tier range, excluding cash + custom', async () => {
    await createCatalogItem({
      geo: 'US',
      reward_type: 'gift_card',
      name: 'US $100',
      description: '',
      amount_usd: 100,
    })
    await createCatalogItem({
      geo: 'US',
      reward_type: 'experience',
      name: 'US $300',
      description: '',
      amount_usd: 300,
    })
    await createCatalogItem({
      geo: 'India',
      reward_type: 'gift_card',
      name: 'India $100',
      description: '',
      amount_usd: 100,
    })
    await createCatalogItem({
      geo: 'US',
      reward_type: 'cash',
      name: 'US cash',
      description: '',
      amount_usd: 150,
    })
    await createCatalogItem({
      geo: 'US',
      reward_type: 'custom',
      name: 'US custom',
      description: '',
      amount_usd: 150,
    })

    const tier1US = await listCatalogForSelection({ geo: 'US', tier: 1 })
    expect(tier1US.map((i) => i.name).sort()).toEqual(['US $100'])
    // Excludes $300 (out of tier 1), India (wrong geo), cash, custom.

    const tier2US = await listCatalogForSelection({ geo: 'US', tier: 2 })
    expect(tier2US.map((i) => i.name).sort()).toEqual(['US $300'])
  })

  it('hides inactive items', async () => {
    const created = await createCatalogItem({
      geo: 'US',
      reward_type: 'gift_card',
      name: 'US active',
      description: '',
      amount_usd: 100,
    })
    await updateCatalogItem(created.id, { active: false })
    const out = await listCatalogForSelection({ geo: 'US', tier: 1 })
    expect(out).toHaveLength(0)
  })
})
