import { db } from '@/lib/db'
import { MOCK_EMPLOYEES } from './mock-data'
import type { Employee, EmployeeSummary } from './types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

export async function getEmployeeById(id: string): Promise<Employee | null> {
  if (useMock()) return MOCK_EMPLOYEES.find((e) => e.id === id) ?? null
  return db.employee.findUnique({ where: { id } }) as Promise<Employee | null>
}

export async function getEmployeeByEmail(email: string): Promise<Employee | null> {
  if (useMock()) return MOCK_EMPLOYEES.find((e) => e.email === email) ?? null
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
