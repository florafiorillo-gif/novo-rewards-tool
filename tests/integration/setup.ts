import { db } from '@/lib/db'
import { MOCK_EMPLOYEES } from '@/modules/employees/mock-data'
import { VALUES } from '@/modules/values/constants'

// Only run integration tests when a real DB is configured. Without both
// env vars we skip — unit mode lives in jest.config.js.
export const INTEGRATION_READY =
  Boolean(process.env.DATABASE_URL) &&
  process.env.USE_MOCK_DATA === 'false'

export const describeIntegration = INTEGRATION_READY
  ? describe
  : describe.skip

// FK-safe delete order. Prisma has no universal truncate, and we'd rather
// keep raw SQL out of tests since schema names can drift.
export async function resetDb(): Promise<void> {
  await db.approvalAction.deleteMany({})
  await db.committeeDecision.deleteMany({})
  await db.reward.deleteMany({})
  await db.budgetException.deleteMany({})
  await db.comment.deleteMany({})
  await db.reaction.deleteMany({})
  await db.nomination.deleteMany({})
  await db.budgetPool.deleteMany({})
  await db.budgetPeriod.deleteMany({})
  await db.teamAwardGroup.deleteMany({})
  await db.digest.deleteMany({})
  await db.scopeNoteTemplate.deleteMany({})
  await db.value.deleteMany({})
  await db.employee.deleteMany({})
}

export async function seedFixtures(): Promise<void> {
  for (const v of VALUES) {
    await db.value.create({
      data: { id: v.id, name: v.name, description: v.description },
    })
  }
  // Managers before reports — the FK on manager_id requires it.
  const sorted = [...MOCK_EMPLOYEES].sort((a, b) => {
    if (!a.manager_id && b.manager_id) return -1
    if (a.manager_id && !b.manager_id) return 1
    return 0
  })
  for (const e of sorted) {
    await db.employee.create({ data: e })
  }
}

// Each suite calls this in afterAll to release the connection pool.
export async function disconnect(): Promise<void> {
  if (!INTEGRATION_READY) return
  await db.$disconnect()
}
