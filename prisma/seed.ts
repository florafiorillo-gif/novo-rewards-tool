import { PrismaClient } from '@prisma/client'
import { MOCK_EMPLOYEES } from '../modules/employees/mock-data'

const db = new PrismaClient()

const VALUES = [
  {
    id: 'val_run_for_the_bus',
    name: 'Run for the Bus',
    description:
      'Bias to action. If it advances a company goal or customer need, move. Do not wait for permission when you have the information to act.',
  },
  {
    id: 'val_hierarchy_not_authority',
    name: 'Hierarchy Is Not Authority',
    description:
      'The best idea wins regardless of who says it. Leaders are comfortable following when someone else has the better answer.',
  },
  {
    id: 'val_assume_best_intention',
    name: 'Assume Best Intention',
    description:
      'Give grace for a bad day, a clumsy message, an unaware tone. Address conflict directly. Extend trust.',
  },
  {
    id: 'val_intellectual_honesty',
    name: 'Intellectual Honesty',
    description:
      'Own mistakes. Apologize before doubling down. Do not contort data to fit a narrative.',
  },
]

async function main() {
  console.log('Seeding values...')
  for (const value of VALUES) {
    await db.value.upsert({
      where: { id: value.id },
      update: { name: value.name, description: value.description },
      create: value,
    })
  }
  console.log(`  ✓ ${VALUES.length} values seeded`)

  console.log('Seeding mock employees...')
  // Seed managers before direct reports to satisfy the FK constraint.
  // Sort: null manager_id first, then by manager_id presence.
  const sorted = [...MOCK_EMPLOYEES].sort((a, b) => {
    if (!a.manager_id && b.manager_id) return -1
    if (a.manager_id && !b.manager_id) return 1
    return 0
  })

  for (const emp of sorted) {
    await db.employee.upsert({
      where: { id: emp.id },
      update: {
        name: emp.name,
        email: emp.email,
        geo: emp.geo,
        manager_id: emp.manager_id,
        role_title: emp.role_title,
        active: emp.active,
        employment_type: emp.employment_type,
        recognition_preference: emp.recognition_preference,
      },
      create: {
        id: emp.id,
        name: emp.name,
        email: emp.email,
        geo: emp.geo,
        manager_id: emp.manager_id,
        role_title: emp.role_title,
        active: emp.active,
        employment_type: emp.employment_type,
        recognition_preference: emp.recognition_preference,
      },
    })
  }
  console.log(`  ✓ ${MOCK_EMPLOYEES.length} employees seeded`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
