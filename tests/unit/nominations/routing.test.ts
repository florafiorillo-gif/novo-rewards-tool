/** @jest-environment node */
import { resolveRouting } from '@/modules/nominations/service'

describe('resolveRouting (spec §6.3)', () => {
  it('routes peer nomination to the nominee manager', () => {
    const result = resolveRouting('emp_peer', {
      id: 'emp_nominee',
      manager_id: 'emp_manager',
    })
    expect(result.current_approver_id).toBe('emp_manager')
    expect(result.requires_people_team_assignment).toBe(false)
  })

  it('routes skip-level nomination to the direct manager, not the nominator', () => {
    const result = resolveRouting('emp_ceo', {
      id: 'emp_ic',
      manager_id: 'emp_manager',
    })
    expect(result.current_approver_id).toBe('emp_manager')
  })

  it('routes to the nominator themselves when they are the nominee manager', () => {
    const result = resolveRouting('emp_manager', {
      id: 'emp_report',
      manager_id: 'emp_manager',
    })
    expect(result.current_approver_id).toBe('emp_manager')
    expect(result.requires_people_team_assignment).toBe(false)
  })

  it('routes to People team queue (null approver) when nominee has no manager', () => {
    const result = resolveRouting('emp_peer', {
      id: 'emp_ceo',
      manager_id: null,
    })
    expect(result.current_approver_id).toBeNull()
    expect(result.requires_people_team_assignment).toBe(true)
  })
})
