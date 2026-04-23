import { getEmployeeById, isManager } from '@/modules/employees/service'

// Role set for the signed-in viewer, used by the dashboard to decide which
// widgets render. Booleans are independent — a single viewer can be several
// at once (Flora is people_team + committee; Rares is committee + manager).
//
// Kept separate from modules/roles/service.ts because that file is about
// resolving *other* people's roles (dept head for a nominee, People-team
// rep for round-robin). This file is about the *viewer's* role set.
export interface ResolvedRole {
  is_manager: boolean
  is_department_head: boolean
  is_people_team: boolean
  is_committee: boolean
  // True when none of the above hold — an individual contributor without
  // admin hats. Useful for "employee-only" widget composition.
  is_employee_only: boolean
}

const NONE: ResolvedRole = {
  is_manager: false,
  is_department_head: false,
  is_people_team: false,
  is_committee: false,
  is_employee_only: true,
}

export async function resolveRole(employeeId: string): Promise<ResolvedRole> {
  const emp = await getEmployeeById(employeeId)
  if (!emp) return NONE

  const is_manager = await isManager(employeeId)
  const is_department_head = emp.is_department_head
  const is_people_team = emp.is_people_team_rep
  const is_committee = emp.is_committee_member
  const is_employee_only =
    !is_manager && !is_department_head && !is_people_team && !is_committee

  return {
    is_manager,
    is_department_head,
    is_people_team,
    is_committee,
    is_employee_only,
  }
}
