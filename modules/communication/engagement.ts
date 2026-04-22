import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { listAllMock } from '@/modules/nominations/mock-store'
import type { NominationRecord } from '@/modules/nominations/types'

const useMock = () => process.env.USE_MOCK_DATA === 'true'

// Spec §11.2 — reactions and thread comments on #made-it-happen posts are
// captured per nomination. Feed the monthly digest + pattern analysis.
// Reactions are keyed by (nomination, user, emoji) for natural idempotency.

export interface ReactionRecord {
  id: string
  nomination_id: string
  user_id: string
  reaction_type: string
  created_at: Date
}

export interface CommentRecord {
  id: string
  nomination_id: string
  user_id: string
  text: string
  created_at: Date
}

// ─── Mock stores ─────────────────────────────────────────────────────────────
// Pinned to globalThis so the Maps are shared across Next.js's server-action
// and server-component webpack layers; see modules/nominations/mock-store.ts
// for the detailed rationale.

const globalForEngagement = globalThis as unknown as {
  __novo_engagement_reactions?: Map<string, ReactionRecord>
  __novo_engagement_comments?: Map<string, CommentRecord>
}
const mockReactions: Map<string, ReactionRecord> =
  globalForEngagement.__novo_engagement_reactions ?? new Map()
const mockComments: Map<string, CommentRecord> =
  globalForEngagement.__novo_engagement_comments ?? new Map()
if (process.env.NODE_ENV !== 'production') {
  globalForEngagement.__novo_engagement_reactions = mockReactions
  globalForEngagement.__novo_engagement_comments = mockComments
}

function reactionKey(r: Pick<ReactionRecord, 'nomination_id' | 'user_id' | 'reaction_type'>) {
  return `${r.nomination_id}|${r.user_id}|${r.reaction_type}`
}

export function resetMockEngagement(): void {
  mockReactions.clear()
  mockComments.clear()
}

// ─── Nomination lookup by Slack post ts ─────────────────────────────────────

export async function findNominationByPostTs(
  post_message_ts: string
): Promise<NominationRecord | null> {
  if (useMock()) {
    return (
      listAllMock().find((n) => n.post_message_ts === post_message_ts) ?? null
    )
  }
  const row = await db.nomination.findFirst({ where: { post_message_ts } })
  return row as unknown as NominationRecord | null
}

// ─── Reactions ───────────────────────────────────────────────────────────────

export async function recordReaction(input: {
  nomination_id: string
  user_id: string
  reaction_type: string
  now?: Date
}): Promise<ReactionRecord> {
  const now = input.now ?? new Date()
  if (useMock()) {
    const key = reactionKey(input)
    for (const r of mockReactions.values()) {
      if (reactionKey(r) === key) return r
    }
    const record: ReactionRecord = {
      id: `rxn_${randomUUID()}`,
      nomination_id: input.nomination_id,
      user_id: input.user_id,
      reaction_type: input.reaction_type,
      created_at: now,
    }
    mockReactions.set(record.id, record)
    return record
  }
  // Prisma — upsert on the composite unique index.
  const row = await db.reaction.upsert({
    where: {
      nomination_id_user_id_reaction_type: {
        nomination_id: input.nomination_id,
        user_id: input.user_id,
        reaction_type: input.reaction_type,
      },
    },
    create: {
      nomination_id: input.nomination_id,
      user_id: input.user_id,
      reaction_type: input.reaction_type,
    },
    update: {},
  })
  return row as unknown as ReactionRecord
}

export async function removeReaction(input: {
  nomination_id: string
  user_id: string
  reaction_type: string
}): Promise<boolean> {
  if (useMock()) {
    const key = reactionKey(input)
    for (const [id, r] of mockReactions) {
      if (reactionKey(r) === key) {
        mockReactions.delete(id)
        return true
      }
    }
    return false
  }
  const res = await db.reaction.deleteMany({
    where: {
      nomination_id: input.nomination_id,
      user_id: input.user_id,
      reaction_type: input.reaction_type,
    },
  })
  return res.count > 0
}

export async function listReactions(nomination_id: string): Promise<ReactionRecord[]> {
  if (useMock()) {
    return [...mockReactions.values()]
      .filter((r) => r.nomination_id === nomination_id)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
  }
  const rows = await db.reaction.findMany({
    where: { nomination_id },
    orderBy: { created_at: 'asc' },
  })
  return rows as unknown as ReactionRecord[]
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function recordComment(input: {
  nomination_id: string
  user_id: string
  text: string
  now?: Date
}): Promise<CommentRecord> {
  const trimmed = input.text.trim()
  if (!trimmed) throw new Error('comment text is empty')
  const now = input.now ?? new Date()
  if (useMock()) {
    const record: CommentRecord = {
      id: `cmt_${randomUUID()}`,
      nomination_id: input.nomination_id,
      user_id: input.user_id,
      text: trimmed,
      created_at: now,
    }
    mockComments.set(record.id, record)
    return record
  }
  const row = await db.comment.create({
    data: {
      nomination_id: input.nomination_id,
      user_id: input.user_id,
      text: trimmed,
    },
  })
  return row as unknown as CommentRecord
}

export async function listComments(nomination_id: string): Promise<CommentRecord[]> {
  if (useMock()) {
    return [...mockComments.values()]
      .filter((c) => c.nomination_id === nomination_id)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
  }
  const rows = await db.comment.findMany({
    where: { nomination_id },
    orderBy: { created_at: 'asc' },
  })
  return rows as unknown as CommentRecord[]
}
