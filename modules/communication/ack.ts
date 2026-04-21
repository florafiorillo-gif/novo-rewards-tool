import { db } from '@/lib/db'
import { getNominationById } from '@/modules/nominations/service'
import { listAllMock, updateMock } from '@/modules/nominations/mock-store'
import { listRewards, getRewardForNomination } from '@/modules/rewards/service'
import { patchNomination } from '@/modules/approvals/shared'
import type { NominationRecord } from '@/modules/nominations/types'
import type { RewardRecord } from '@/modules/rewards/types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// Spec §9.8 — post fires on ack, or 24h after the recipient DM was sent.
// For 6B we use reward.issued_at as the DM-sent proxy; 6E introduces a
// dedicated recipient_dm_sent_at on Reward and this constant is re-anchored.
export const POST_TIMEOUT_MS = 24 * 60 * 60 * 1000

export type AckError =
  | 'not_found'
  | 'not_recipient'
  | 'not_approved'

export type AckResult =
  | { ok: true; nomination: NominationRecord; already: boolean }
  | { ok: false; error: AckError }

// Recipient clicked "React to acknowledge" on their reward DM. Sets
// acknowledged_at (idempotent — re-clicks leave the first timestamp
// intact) but does NOT fire the channel post; that's the caller's job
// (the Slack handler calls firePostIfReady next, and the cron sweeps
// any we missed after 24h).
export async function acknowledgeNomination(
  nomination_id: string,
  actor_id: string,
  now: Date = new Date()
): Promise<AckResult> {
  const nom = await getNominationById(nomination_id)
  if (!nom) return { ok: false, error: 'not_found' }
  if (nom.nominee_id !== actor_id) return { ok: false, error: 'not_recipient' }
  // Require the nomination to have reached approved/fulfilled; no point
  // acking a denied or cancelled one.
  if (nom.status !== 'approved' && nom.status !== 'fulfilled') {
    return { ok: false, error: 'not_approved' }
  }
  if (nom.acknowledged_at) {
    return { ok: true, nomination: nom, already: true }
  }
  const updated = await patchNomination(nom.id, { acknowledged_at: now })
  return { ok: true, nomination: updated, already: false }
}

// Idempotent — a second call with the same (or different) message_ts
// after a post has already fired is a no-op. This is the one-way
// transition from "ack'd / timed-out" to "posted"; once set it stays.
export async function markPostFired(
  nomination_id: string,
  post_message_ts: string | null,
  now: Date = new Date()
): Promise<{ fired: boolean; nomination: NominationRecord | null }> {
  const nom = await getNominationById(nomination_id)
  if (!nom) return { fired: false, nomination: null }
  if (nom.post_fired_at) return { fired: false, nomination: nom }
  const updated = await patchNomination(nom.id, {
    post_fired_at: now,
    post_message_ts,
  })
  return { fired: true, nomination: updated }
}

// Pure — gives the sweep + the ack handler a single source of truth
// for "is this nomination ready for a #made-it-happen post?"
export function shouldFirePost(
  nom: NominationRecord,
  reward: RewardRecord | null,
  now: Date
): boolean {
  if (nom.post_fired_at) return false
  if (nom.status !== 'approved' && nom.status !== 'fulfilled') return false
  if (nom.acknowledged_at) return true
  // Timeout clock starts when the recipient DM went out. In 6B that's
  // tracked as reward.issued_at; 6E moves to an explicit column.
  const dmSentAt = reward?.issued_at
  if (!dmSentAt) return false
  return now.getTime() - dmSentAt.getTime() >= POST_TIMEOUT_MS
}

// Injected sender. 6B ships a stub (returns { message_ts: null }); 6C
// swaps in the real Slack channel post.
export type PostSender = (
  nomination: NominationRecord
) => Promise<{ message_ts: string | null }>

export const stubPostSender: PostSender = async () => ({ message_ts: null })

// Called by the Slack ack-button handler immediately after
// acknowledgeNomination succeeds, and by the cron sweep for 24h
// timeouts. Idempotent via markPostFired.
export async function firePostIfReady(
  nomination_id: string,
  sender: PostSender,
  now: Date = new Date()
): Promise<{ fired: boolean; message_ts: string | null }> {
  const nom = await getNominationById(nomination_id)
  if (!nom) return { fired: false, message_ts: null }
  const reward = await getRewardForNomination(nomination_id)
  if (!shouldFirePost(nom, reward, now)) return { fired: false, message_ts: null }
  const { message_ts } = await sender(nom)
  const marked = await markPostFired(nomination_id, message_ts, now)
  return { fired: marked.fired, message_ts }
}

export async function runPostSweep(
  sender: PostSender,
  now: Date = new Date()
): Promise<{ fired: string[]; skipped: string[] }> {
  const candidates = await loadCandidates()
  const rewards = await listRewards()
  const rewardByNom = new Map(rewards.map((r) => [r.nomination_id, r]))
  const fired: string[] = []
  const skipped: string[] = []
  for (const nom of candidates) {
    const reward = rewardByNom.get(nom.id) ?? null
    if (!shouldFirePost(nom, reward, now)) {
      skipped.push(nom.id)
      continue
    }
    const { message_ts } = await sender(nom)
    await markPostFired(nom.id, message_ts, now)
    fired.push(nom.id)
  }
  return { fired, skipped }
}

async function loadCandidates(): Promise<NominationRecord[]> {
  if (useMock()) {
    return listAllMock().filter(
      (n) =>
        (n.status === 'approved' || n.status === 'fulfilled') &&
        !n.post_fired_at
    )
  }
  const rows = await db.nomination.findMany({
    where: {
      status: { in: ['approved', 'fulfilled'] },
      post_fired_at: null,
    },
  })
  return rows as unknown as NominationRecord[]
}

// Test seam — lets tests push a nomination into the mock store and adjust
// it to mimic a post-DM state without running the whole approval flow.
export function _mockPatchForTests(
  nomination_id: string,
  patch: Partial<NominationRecord>
): void {
  if (!useMock()) throw new Error('_mockPatchForTests requires mock mode')
  updateMock(nomination_id, patch)
}
