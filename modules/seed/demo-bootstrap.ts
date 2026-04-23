import { insertMock } from '@/modules/nominations/mock-store'
import { recordReaction, recordComment } from '@/modules/communication/engagement'
import { createPeriod } from '@/modules/budget/periods'
import { allocatePools } from '@/modules/budget/allocation'
import { updateMockPeriod, listMockPeriods } from '@/modules/budget/mock-store'
import { DEFAULT_ALLOCATION_CONFIG } from '@/modules/budget/types'
import {
  buildDemoNominations,
  DEMO_REACTIONS,
  DEMO_COMMENTS,
} from './demo-nominations'

// Side-effect module. Importing it once triggers demo-store seeding when
// SEED_MODE=demo. Called from app/layout.tsx so the seed runs during the
// initial server module-load pass and is cached by Node's require cache
// across every subsequent request in the same process. Guards via a
// globalThis flag so the HMR restart path (which clears the require cache
// of some modules but not others) can't double-seed.
//
// Only runs under USE_MOCK_DATA=true + SEED_MODE=demo. Prisma-mode demo
// seeding lives in prisma/seed.ts and is a separate workflow.

const globalForDemo = globalThis as unknown as {
  __novo_demo_seeded?: boolean
}

if (
  process.env.USE_MOCK_DATA === 'true' &&
  process.env.SEED_MODE === 'demo' &&
  !globalForDemo.__novo_demo_seeded
) {
  globalForDemo.__novo_demo_seeded = true
  seedDemoStores().catch((err) => {
    // Fail loud in dev, don't crash prod.
    console.error('[demo-seed] seeding failed:', err)
  })
}

async function seedDemoStores(): Promise<void> {
  await seedQ2Period()

  const nominations = buildDemoNominations()
  for (const nom of nominations) {
    insertMock(nom)
  }

  // recordReaction + recordComment are async because the real path hits
  // Prisma; mock path is synchronous under the hood but the signature
  // still returns a Promise. Awaited sequentially because the store is
  // tiny and ordering is cheap insurance.
  for (const r of DEMO_REACTIONS) {
    await recordReaction({
      nomination_id: r.nomination_id,
      user_id: r.user_id,
      reaction_type: r.reaction_type,
    })
  }
  for (const c of DEMO_COMMENTS) {
    await recordComment({
      nomination_id: c.nomination_id,
      user_id: c.user_id,
      text: c.text,
    })
  }

  console.log(
    `[demo-seed] ${nominations.length} nominations, ${DEMO_REACTIONS.length} reactions, ${DEMO_COMMENTS.length} comments`
  )
}

// Q2 2026 period flipped to active + pools allocated. Mirrors what
// prisma/seed.ts does in dev mode for Postgres so the two paths line up.
// Skipped if any period already exists (tests may seed their own).
async function seedQ2Period(): Promise<void> {
  if (listMockPeriods().length > 0) return
  const result = await createPeriod({
    period_label: 'Q2 2026',
    start_date: new Date(2026, 3, 1),
    end_date: new Date(2026, 5, 30),
    total_allocation_usd: 100_000,
    allocation_config: DEFAULT_ALLOCATION_CONFIG,
  })
  if (!result.ok) {
    console.error('[demo-seed] createPeriod failed:', result.error)
    return
  }
  const alloc = await allocatePools(result.period.id, DEFAULT_ALLOCATION_CONFIG)
  if (!alloc.ok) {
    console.error('[demo-seed] allocatePools failed:', alloc.error)
    return
  }
  updateMockPeriod(result.period.id, {
    status: 'active',
    approved_at: new Date(),
  })
  console.log(
    `[demo-seed] Q2 2026 active · ${alloc.result.pools.length} pools`
  )
}

export {}
