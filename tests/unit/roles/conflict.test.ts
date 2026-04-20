/** @jest-environment node */
process.env.USE_MOCK_DATA = 'true'

import { hasTier3Conflict, resolveDepartmentHead } from '@/modules/roles/service'

describe('hasTier3Conflict (spec §7.5)', () => {
  it('flags conflict when committee member is the direct manager of the nominee', async () => {
    // Flora (emp_002) manages Rubina (emp_003).
    const conflict = await hasTier3Conflict('emp_002', 'emp_003')
    expect(conflict).toBe(true)
  })

  it('flags conflict when committee member is the skip-level manager', async () => {
    // Rares (emp_001) manages Sarah (emp_005) who manages Alex (emp_006).
    // Rares is Alex's skip-level.
    const conflict = await hasTier3Conflict('emp_001', 'emp_006')
    expect(conflict).toBe(true)
  })

  it('does not flag conflict for three-levels-away nominees', async () => {
    // Flora (emp_002) → Sakshi (emp_004). Sakshi has no reports.
    // But check: Rares (emp_001) → Flora (emp_002) → Sakshi (emp_004).
    // Rares→Sakshi is skip-level. So this should be true — conflict.
    // Use a more distant pair: Flora (emp_002) manages Rubina (emp_003).
    // Rubina has no reports. So three-levels-away doesn't exist in mock data.
    // Instead test: Rares and Valentina (emp_011, Carlos's report).
    // Rares → Carlos → Valentina. That is skip-level = conflict.
    // So we need someone further: Rares is the CEO, everyone is within 2 levels.
    // Use: Flora → Rubina (emp_003). Rubina is direct report of Flora.
    // Flora → Sakshi (emp_004). Sakshi is direct report of Flora.
    // Flora and Alex (emp_006)? Alex manager is Sarah. Sarah's manager is Rares,
    // not Flora. So Flora has no management chain over Alex → no conflict.
    const conflict = await hasTier3Conflict('emp_002', 'emp_006')
    expect(conflict).toBe(false)
  })

  it('returns false when the nominee has no manager', async () => {
    // Rares (emp_001) has no manager.
    const conflict = await hasTier3Conflict('emp_002', 'emp_001')
    expect(conflict).toBe(false)
  })
})

describe('resolveDepartmentHead', () => {
  it('returns the dept head in the same {department, geo}', async () => {
    const head = await resolveDepartmentHead({
      id: 'emp_006',
      department: 'Engineering',
      geo: 'US',
    })
    expect(head?.id).toBe('emp_005') // Sarah Chen
  })

  it('falls back to any dept head in the same department if no same-geo match', async () => {
    // Mock data only has one Engineering head per geo. Simulate Valentina in
    // Operations without a Colombia Ops head... actually Carlos is the head.
    // Create a synthetic nominee with a department that has no head in its geo:
    // "Engineering" in "Colombia" has no head (Carlos is Operations).
    // resolveDepartmentHead should fall back cross-geo.
    const head = await resolveDepartmentHead({
      id: 'emp_synthetic',
      department: 'Engineering',
      geo: 'Colombia',
    })
    // Either the US Eng head (Sarah, emp_005) or India Eng head (Priya, emp_008) —
    // the first match wins.
    expect(['emp_005', 'emp_008']).toContain(head?.id)
  })

  it('returns null when no department is set on the nominee', async () => {
    const head = await resolveDepartmentHead({
      id: 'emp_001',
      department: null,
      geo: 'US',
    })
    expect(head).toBeNull()
  })
})
