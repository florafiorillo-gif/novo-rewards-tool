import { insertMock } from '@/modules/nominations/mock-store'
import { recordReaction, recordComment } from '@/modules/communication/engagement'
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

export {}
