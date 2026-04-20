import { PrismaClient } from '@prisma/client'
import { MOCK_EMPLOYEES } from '../modules/employees/mock-data'
import { VALUES } from '../modules/values/constants'

const db = new PrismaClient()

async function main() {
  console.log('Seeding values...')
  for (const value of VALUES) {
    await db.value.upsert({
      where: { id: value.id },
      update: { name: value.name, description: value.description },
      create: {
        id: value.id,
        name: value.name,
        description: value.description,
      },
    })
  }
  console.log(`  ✓ ${VALUES.length} values seeded`)

  console.log('Seeding mock employees (including the inactive System actor)...')
  // Seed managers before direct reports to satisfy the FK constraint.
  // Sort: null manager_id first, then by manager_id presence.
  const sorted = [...MOCK_EMPLOYEES].sort((a, b) => {
    if (!a.manager_id && b.manager_id) return -1
    if (a.manager_id && !b.manager_id) return 1
    return 0
  })

  for (const emp of sorted) {
    const data = {
      name: emp.name,
      email: emp.email,
      geo: emp.geo,
      manager_id: emp.manager_id,
      role_title: emp.role_title,
      active: emp.active,
      employment_type: emp.employment_type,
      recognition_preference: emp.recognition_preference,
      department: emp.department,
      is_department_head: emp.is_department_head,
      is_people_team_rep: emp.is_people_team_rep,
      is_committee_member: emp.is_committee_member,
      tier2_assignments_count: emp.tier2_assignments_count,
    }
    await db.employee.upsert({
      where: { id: emp.id },
      update: data,
      create: { id: emp.id, ...data },
    })
  }
  console.log(`  ✓ ${MOCK_EMPLOYEES.length} employees seeded`)

  console.log('Seeding Q2 2026 budget period (for local dev demos)...')
  const existing = await db.budgetPeriod.findFirst({
    where: { period_label: 'Q2 2026' },
  })
  if (existing) {
    console.log('  · Q2 2026 already seeded; skipping')
  } else {
    const { createPeriod } = await import('../modules/budget/periods')
    const { allocatePools } = await import('../modules/budget/allocation')
    const { DEFAULT_ALLOCATION_CONFIG } = await import('../modules/budget/types')
    const result = await createPeriod({
      period_label: 'Q2 2026',
      start_date: new Date('2026-04-01'),
      end_date: new Date('2026-06-30'),
      total_allocation_usd: 100_000,
      allocation_config: DEFAULT_ALLOCATION_CONFIG,
    })
    if (!result.ok) throw new Error('seed: createPeriod failed')
    const alloc = await allocatePools(result.period.id, DEFAULT_ALLOCATION_CONFIG)
    if (!alloc.ok) throw new Error('seed: allocatePools failed')
    // Flip directly to active for the mock demo; real periods require
    // committee approval via /committee/budget.
    await db.budgetPeriod.update({
      where: { id: result.period.id },
      data: { status: 'active', approved_at: new Date() },
    })
    console.log(
      `  ✓ Q2 2026 period active with ${alloc.result.pools.length} pools`
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
