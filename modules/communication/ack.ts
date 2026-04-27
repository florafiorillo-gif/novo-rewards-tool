import { db } from '@/lib/db'
import {
  getNominationById,
  listGroupSiblings,
} from '@/modules/nominations/service'
import { getEmployeeById } from '@/modules/employees/service'
import { listAllMock, updateMock } from '@/modules/nominations/mock-store'
import { listRewards, getRewardForNomination } from '@/modules/rewards/service'
import { patchNomination } from '@/modules/approvals/shared'
import type { NominationRecord } from '@/modules/nominations/types'
import type { RewardRecord } from '@/modules/rewards/types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// Spec §9.8 — post fires on ack, or 24h after the recipient DM was sent.
// The anchor is reward.recipient_dm_sent_at (Phase 6E); if it's null (pre-6E
// data or not-yet-sent), we fall back to reward.issued_at so the logic
// stays monotonically forward-compatible.
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
  // Timeout clock starts when the recipient DM actually went out.
  const dmSentAt = reward?.recipient_dm_sent_at ?? reward?.issued_at ?? null
  if (!dmSentAt) return false
  return now.getTime() - dmSentAt.getTime() >= POST_TIMEOUT_MS
}

// Injected sender. Always receives an array; length 1 means a
// single-row post, length >= 2 means a unified group post (Round 3
// group nominations). Implementations branch internally — see
// realPostSender in modules/communication/post.ts.
export type PostSender = (
  nominations: NominationRecord[]
) => Promise<{ message_ts: string | null }>

export const stubPostSender: PostSender = async () => ({ message_ts: null })

// Called by the Slack ack-button handler immediately after
// acknowledgeNomination succeeds, and by the cron sweep for 24h
// timeouts. Idempotent via markPostFired. Group-aware: if the
// nomination is part of a group, defers until every public sibling
// has settled, then fires one unified post for the public ready
// set; private/team_only siblings keep their independent fire-and-
// mark behavior.
export async function firePostIfReady(
  nomination_id: string,
  sender: PostSender,
  now: Date = new Date()
): Promise<{ fired: boolean; message_ts: string | null }> {
  const nom = await getNominationById(nomination_id)
  if (!nom) return { fired: false, message_ts: null }

  if (nom.team_award_group_id) {
    return fireGroupPostIfReady(nom, sender, now)
  }

  const reward = await getRewardForNomination(nomination_id)
  if (!shouldFirePost(nom, reward, now)) return { fired: false, message_ts: null }
  const { message_ts } = await sender([nom])
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
    if (nom.post_fired_at) {
      // A previous iteration in this same sweep (e.g. another sibling
      // in the same group) already fanned this row's post_fired_at.
      // Re-read happens implicitly via getNominationById in the group
      // path; skip the cached snapshot.
      skipped.push(nom.id)
      continue
    }
    if (nom.team_award_group_id) {
      const result = await fireGroupPostIfReady(nom, sender, now)
      if (result.fired) fired.push(nom.id)
      else skipped.push(nom.id)
      continue
    }
    const reward = rewardByNom.get(nom.id) ?? null
    if (!shouldFirePost(nom, reward, now)) {
      skipped.push(nom.id)
      continue
    }
    const { message_ts } = await sender([nom])
    await markPostFired(nom.id, message_ts, now)
    fired.push(nom.id)
  }
  return { fired, skipped }
}

// ─── Group post firing ───────────────────────────────────────────────
//
// Conditions to fire a group post for a given trigger nomination:
//
//   1. Every PUBLIC-pref sibling has "settled" — meaning each one is
//      either already fired, ready to fire right now (acked or 24h
//      timeout), or in a terminal state (denied / cancelled). If any
//      public sibling is still pending (submitted / under_review /
//      approved-but-no-DM-yet), we defer.
//
//   2. After settle, count public ready siblings:
//        - >= 2 → unified group post (sender receives the public list)
//        - 1    → single-row post (spec: "only one approved, post
//                 normally"); sender receives a 1-element list
//        - 0    → no public post; just mark the trigger's post_fired_at
//                 with message_ts=null so it stops re-considering
//
//   3. After firing, mark every ready sibling post_fired_at:
//        - Public siblings get the group's message_ts so reactions
//          can attach later if the comm-reactions module wires it.
//        - Private / team_only siblings get null (matches existing
//          single-row private behavior — no post on their row).

async function fireGroupPostIfReady(
  trigger: NominationRecord,
  sender: PostSender,
  now: Date
): Promise<{ fired: boolean; message_ts: string | null }> {
  const siblings = await listGroupSiblings(trigger.team_award_group_id)
  if (siblings.length === 0) {
    // Defensive — trigger had a group_id but the lookup found
    // nothing. Treat as a single-row post.
    const reward = await getRewardForNomination(trigger.id)
    if (!shouldFirePost(trigger, reward, now)) {
      return { fired: false, message_ts: null }
    }
    const { message_ts } = await sender([trigger])
    await markPostFired(trigger.id, message_ts, now)
    return { fired: true, message_ts }
  }

  // Hydrate per-sibling state: recipient (for visibility pref),
  // reward (for shouldFirePost), and a "ready/settled/pending" tag.
  type Hydrated = {
    nom: NominationRecord
    isPublic: boolean
    state: 'fired' | 'ready' | 'terminal' | 'pending'
  }
  const hydrated: Hydrated[] = []
  for (const s of siblings) {
    const recipient = await getEmployeeById(s.nominee_id)
    const isPublic = recipient?.recognition_preference === 'public'
    if (s.post_fired_at) {
      hydrated.push({ nom: s, isPublic, state: 'fired' })
      continue
    }
    if (s.status === 'denied' || s.status === 'cancelled') {
      hydrated.push({ nom: s, isPublic, state: 'terminal' })
      continue
    }
    if (s.status !== 'approved' && s.status !== 'fulfilled') {
      hydrated.push({ nom: s, isPublic, state: 'pending' })
      continue
    }
    const reward = await getRewardForNomination(s.id)
    if (shouldFirePost(s, reward, now)) {
      hydrated.push({ nom: s, isPublic, state: 'ready' })
    } else {
      // Approved/fulfilled but no DM sent or no ack/timeout yet.
      hydrated.push({ nom: s, isPublic, state: 'pending' })
    }
  }

  // Defer if any public sibling is still in flight.
  const publicPending = hydrated.some(
    (h) => h.isPublic && h.state === 'pending'
  )
  if (publicPending) return { fired: false, message_ts: null }

  const readyPublic = hydrated.filter((h) => h.isPublic && h.state === 'ready')
  const readyAll = hydrated.filter((h) => h.state === 'ready')

  if (readyPublic.length === 0) {
    // No public post to fire. Mark every ready sibling (which by
    // definition are non-public here) post_fired_at with null —
    // matches single-row private behavior. The trigger itself is
    // among them if it was ready.
    for (const r of readyAll) {
      await markPostFired(r.nom.id, null, now)
    }
    // If the trigger wasn't ready (e.g. it's terminal/fired and
    // sweep happened to surface it), there's nothing more to do.
    return { fired: readyAll.length > 0, message_ts: null }
  }

  // At least one public ready sibling — fire the post. The sender
  // receives the public list; length 1 → single-row, length >=2 →
  // unified group post.
  const senderResult = await sender(readyPublic.map((r) => r.nom))

  // Mark every ready sibling post_fired_at. Public ones get the
  // group's message_ts; non-public ones get null.
  for (const r of readyAll) {
    await markPostFired(
      r.nom.id,
      r.isPublic ? senderResult.message_ts : null,
      now
    )
  }

  return { fired: true, message_ts: senderResult.message_ts }
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
