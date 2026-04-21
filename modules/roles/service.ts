import { db } from '@/lib/db'
import { getEmployeeById, getAllActiveEmployees } from '@/modules/employees/service'
import type { Employee } from '@/modules/employees/types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// Spec §7.4 — dept head for Tier 2 approval is the is_department_head=true
// employee in the same {department, geo}. If none exists (small geo, early
// days), we fall back to any dept head in the same department regardless of
// geo, then null (surfaces as People-team-assigned fallback).

export async function resolveDepartmentHead(
  nominee: Pick<Employee, 'department' | 'geo' | 'id'>
): Promise<Employee | null> {
  if (!nominee.department) return null
  const all = await getAllActiveEmployeesFull()
  const sameGeo = all.find(
    (e) =>
      e.is_department_head &&
      e.department === nominee.department &&
      e.geo === nominee.geo &&
      e.id !== nominee.id
  )
  if (sameGeo) return sameGeo
  const anyGeo = all.find(
    (e) =>
      e.is_department_head &&
      e.department === nominee.department &&
      e.id !== nominee.id
  )
  return anyGeo ?? null
}

// Spec §7.4 — round-robin People team rep assignment. Deterministic; picks
// the rep with the lowest tier2_assignments_count. Ties broken by id (stable).
// Increments the counter as part of the same call so concurrent propose_upgrade
// calls don't both pick the same person (DB-level; mock mode is single-threaded).

export async function pickAndChargePeopleTeamRep(
  excludeEmployeeId?: string
): Promise<Employee | null> {
  if (useMock()) {
    const all = await getAllActiveEmployeesFull()
    const reps = all
      .filter((e) => e.is_people_team_rep && e.id !== excludeEmployeeId)
      .sort((a, b) => {
        if (a.tier2_assignments_count !== b.tier2_assignments_count) {
          return a.tier2_assignments_count - b.tier2_assignments_count
        }
        return a.id.localeCompare(b.id)
      })
    const chosen = reps[0]
    if (!chosen) return null
    chosen.tier2_assignments_count += 1
    return chosen
  }

  return db.$transaction(async (tx) => {
    const reps = await tx.employee.findMany({
      where: {
        is_people_team_rep: true,
        active: true,
        id: excludeEmployeeId ? { not: excludeEmployeeId } : undefined,
      },
      orderBy: [{ tier2_assignments_count: 'asc' }, { id: 'asc' }],
      take: 1,
    })
    const chosen = reps[0]
    if (!chosen) return null
    await tx.employee.update({
      where: { id: chosen.id },
      data: { tier2_assignments_count: { increment: 1 } },
    })
    return chosen as unknown as Employee
  })
}

// Spec §3 — Flora and Rares. Seeded via is_committee_member on Employee.

export async function getCommitteeMembers(): Promise<Employee[]> {
  const all = await getAllActiveEmployeesFull()
  return all.filter((e) => e.is_committee_member)
}

export async function isCommitteeMember(employeeId: string): Promise<boolean> {
  const emp = await getEmployeeById(employeeId)
  return emp?.is_committee_member === true
}

// People Ops surfaces — catalog + scope note admin + manual fulfillment queue.
// Spec §3: "People team representative... Owns catalog maintenance per geo."
export async function isPeopleTeamRep(employeeId: string): Promise<boolean> {
  const emp = await getEmployeeById(employeeId)
  return emp?.is_people_team_rep === true
}

// Spec §7.5 — committee member recuses when nominee is their direct or
// skip-level report. We walk up the nominee's manager chain and check whether
// the committee member appears within two levels.

export async function hasTier3Conflict(
  committeeMemberId: string,
  nomineeId: string
): Promise<boolean> {
  const nominee = await getEmployeeById(nomineeId)
  if (!nominee?.manager_id) return false

  const direct = await getEmployeeById(nominee.manager_id)
  if (!direct) return false
  if (direct.id === committeeMemberId) return true
  if (!direct.manager_id) return false

  const skip = await getEmployeeById(direct.manager_id)
  return skip?.id === committeeMemberId
}

// In-memory variant for batch queue hydration. The caller provides a map
// of already-loaded employees keyed by id so we avoid three DB hops per
// row in the committee queue.
export function hasTier3ConflictFromMap(
  committeeMemberId: string,
  nomineeId: string,
  employeesById: Map<string, Employee>
): boolean {
  const nominee = employeesById.get(nomineeId)
  if (!nominee?.manager_id) return false
  const direct = employeesById.get(nominee.manager_id)
  if (!direct) return false
  if (direct.id === committeeMemberId) return true
  if (!direct.manager_id) return false
  const skip = employeesById.get(direct.manager_id)
  return skip?.id === committeeMemberId
}

// ─── Internal ────────────────────────────────────────────────────────────────
// getAllActiveEmployees() returns EmployeeSummary. Role flags live on the full
// Employee shape, so we read the richer record for role resolution.

async function getAllActiveEmployeesFull(): Promise<Employee[]> {
  if (useMock()) {
    // Lazy import to keep prod code away from mock path.
    const { MOCK_EMPLOYEES } = await import('@/modules/employees/mock-data')
    return MOCK_EMPLOYEES.filter((e) => e.active)
  }
  const rows = await db.employee.findMany({ where: { active: true } })
  return rows as unknown as Employee[]
}

// Consumed by employees/service-level listers that only need summaries.
export { getAllActiveEmployees }
