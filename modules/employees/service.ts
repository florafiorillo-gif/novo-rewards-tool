import { db } from '@/lib/db'
import { MOCK_EMPLOYEES } from './mock-data'
import type { Employee, EmployeeSummary, RecognitionPreference } from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// Mock-mode only: recognition_preference changes from the settings UI
// accumulate here rather than mutating MOCK_EMPLOYEES so the fixture
// stays stable across tests. Applied in every Employee-returning reader.
//
// Pinned to globalThis so the Map is shared across Next.js's server-action
// and server-component webpack layers — otherwise a preference set by the
// settings action isn't visible to the dashboard/nomination pages that
// render using the mock override. See modules/nominations/mock-store.ts.
const globalForRecognitionOverrides = globalThis as unknown as {
  __novo_recognition_overrides?: Map<string, RecognitionPreference>
}
const mockRecognitionOverrides: Map<string, RecognitionPreference> =
  globalForRecognitionOverrides.__novo_recognition_overrides ?? new Map()
if (process.env.NODE_ENV !== 'production') {
  globalForRecognitionOverrides.__novo_recognition_overrides =
    mockRecognitionOverrides
}

export function resetMockRecognitionOverrides(): void {
  mockRecognitionOverrides.clear()
}

function applyMockOverrides(employee: Employee): Employee {
  const override = mockRecognitionOverrides.get(employee.id)
  return override ? { ...employee, recognition_preference: override } : employee
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  if (useMock()) {
    const row = MOCK_EMPLOYEES.find((e) => e.id === id)
    return row ? applyMockOverrides(row) : null
  }
  return db.employee.findUnique({ where: { id } }) as Promise<Employee | null>
}

export async function getEmployeeByEmail(email: string): Promise<Employee | null> {
  if (useMock()) {
    const row = MOCK_EMPLOYEES.find((e) => e.email === email)
    return row ? applyMockOverrides(row) : null
  }
  return db.employee.findUnique({ where: { email } }) as Promise<Employee | null>
}

export async function getAllActiveEmployees(): Promise<EmployeeSummary[]> {
  if (useMock()) {
    return MOCK_EMPLOYEES.filter((e) => e.active).map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      geo: e.geo,
      role_title: e.role_title,
      manager_id: e.manager_id,
    }))
  }
  return db.employee.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true, geo: true, role_title: true, manager_id: true },
  }) as Promise<EmployeeSummary[]>
}

export async function getDirectReports(managerId: string): Promise<EmployeeSummary[]> {
  if (useMock()) {
    return MOCK_EMPLOYEES.filter((e) => e.manager_id === managerId && e.active).map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      geo: e.geo,
      role_title: e.role_title,
      manager_id: e.manager_id,
    }))
  }
  return db.employee.findMany({
    where: { manager_id: managerId, active: true },
    select: { id: true, name: true, email: true, geo: true, role_title: true, manager_id: true },
  }) as Promise<EmployeeSummary[]>
}

export async function isManager(employeeId: string): Promise<boolean> {
  if (useMock()) return MOCK_EMPLOYEES.some((e) => e.manager_id === employeeId && e.active)
  const count = await db.employee.count({ where: { manager_id: employeeId, active: true } })
  return count > 0
}

// Returns the manager of a given employee, or null if they have no manager.
export async function getManager(employeeId: string): Promise<Employee | null> {
  const employee = await getEmployeeById(employeeId)
  if (!employee?.manager_id) return null
  return getEmployeeById(employee.manager_id)
}

// Walks up the reporting chain from `employeeId` and returns the set of
// every ancestor (manager, manager's manager, … all the way to a root
// node). The starting employee is NOT included. Used by peer
// recognition to enforce the org-direction rule: a nominator must not
// recognize anyone above them in their own chain.
//
// Has a hard depth cap to fail safe in the presence of a malformed
// directory cycle (manager_id loop). 32 is well beyond any plausible
// real org chart depth and stops the loop without throwing.
export async function getReportingChainAbove(
  employeeId: string
): Promise<Set<string>> {
  const ancestors = new Set<string>()
  let cursor = await getEmployeeById(employeeId)
  let depth = 0
  while (cursor?.manager_id && depth < 32) {
    if (ancestors.has(cursor.manager_id)) break
    ancestors.add(cursor.manager_id)
    cursor = await getEmployeeById(cursor.manager_id)
    depth++
  }
  return ancestors
}

// Bulk lookup. Returns a Map keyed by employee id. Unknown ids are
// simply absent from the map. Consumers should handle the miss case.
export async function getEmployeesByIds(
  ids: string[]
): Promise<Map<string, Employee>> {
  const unique = Array.from(new Set(ids.filter((id) => id.length > 0)))
  if (unique.length === 0) return new Map()
  if (useMock()) {
    const idSet = new Set(unique)
    const rows = MOCK_EMPLOYEES.filter((e) => idSet.has(e.id))
    return new Map(rows.map((e) => [e.id, e]))
  }
  const rows = (await db.employee.findMany({
    where: { id: { in: unique } },
  })) as unknown as Employee[]
  return new Map(rows.map((e) => [e.id, e]))
}

// Spec §11.5 — recipient sets this on their own profile from the web app.
// Governs #made-it-happen post behavior (Phase 6C): public = full channel
// post; team_only = falls back to private in v1 since team channels aren't
// wired; private = no public post, recognition still delivered privately.
export async function setRecognitionPreference(
  employeeId: string,
  preference: RecognitionPreference
): Promise<void> {
  if (useMock()) {
    if (!MOCK_EMPLOYEES.some((e) => e.id === employeeId)) {
      throw new Error(`Unknown employee ${employeeId}`)
    }
    mockRecognitionOverrides.set(employeeId, preference)
    return
  }
  await db.employee.update({
    where: { id: employeeId },
    data: { recognition_preference: preference },
  })
}
