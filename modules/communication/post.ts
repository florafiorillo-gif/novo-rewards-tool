import { getEmployeeById } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import { getRewardForNomination } from '@/modules/rewards/service'
import { listActions } from '@/modules/approvals/shared'
import { getSlackClient } from '@/modules/integrations/slack/client'
import type { NominationRecord } from '@/modules/nominations/types'
import type { Employee } from '@/modules/employees/types'
import type { RewardRecord } from '@/modules/rewards/types'
import type { PostSender } from './ack'

// Spec §9.6 — #made-it-happen post format:
//   **[Nominee]** | **[Value]**
//   [Nominator]: "[behavior_text]"
//
//   [Optional outcome on Tier 2 + 3]
//
//   [Scope note — [approver name], [role]]
//
// No tier label, no dollar amount. Tier 3 gets a subtle visual
// differentiator (the ✨ accent) to signal weight without naming it.
// Spec §11.1 — thread starter invites "React or reply if you saw this
// happen too."

export const TIER_3_ACCENT = '✨'
export const THREAD_STARTER = 'React or reply if you saw this happen too.'

export interface PostAssembly {
  header: string
  nominator_quote: string
  outcome: string | null
  scope_note_line: string | null
  thread_starter: string
}

export function buildPostAssembly(args: {
  nomination: NominationRecord
  nominator: Employee
  nominee: Employee
  value_name: string
  approver: Employee | null
  scope_note_text: string | null
}): PostAssembly {
  const { nomination, nominator, nominee, value_name, approver, scope_note_text } = args
  const accent = nomination.current_tier === 3 ? `${TIER_3_ACCENT} ` : ''
  const header = `${accent}*${nominee.name}* | *${value_name}*`
  const nominator_quote = `${nominator.name}: "${nomination.behavior_text}"`

  // Spec §9.6: outcome appended only for Tier 2 and 3 to signal weightier
  // context. Tier 1 stays terse.
  const outcome =
    nomination.current_tier >= 2 && nomination.outcome_text.trim().length > 0
      ? nomination.outcome_text
      : null

  let scope_note_line: string | null = null
  if (scope_note_text && scope_note_text.trim().length > 0 && approver) {
    const role = describeApproverRole(approver, nomination.current_tier)
    scope_note_line = `${scope_note_text.trim()}\n— ${approver.name}, ${role}`
  }

  return {
    header,
    nominator_quote,
    outcome,
    scope_note_line,
    thread_starter: THREAD_STARTER,
  }
}

export function buildPostBlocks(assembly: PostAssembly) {
  const sections = [
    {
      type: 'section' as const,
      text: { type: 'mrkdwn' as const, text: assembly.header },
    },
    {
      type: 'section' as const,
      text: { type: 'mrkdwn' as const, text: assembly.nominator_quote },
    },
  ]
  if (assembly.outcome) {
    sections.push({
      type: 'section' as const,
      text: { type: 'mrkdwn' as const, text: `_${assembly.outcome}_` },
    })
  }
  if (assembly.scope_note_line) {
    sections.push({
      type: 'section' as const,
      text: { type: 'mrkdwn' as const, text: assembly.scope_note_line },
    })
  }
  sections.push({
    type: 'section' as const,
    text: { type: 'mrkdwn' as const, text: `_${assembly.thread_starter}_` },
  })
  return sections
}

export function buildPostFallbackText(assembly: PostAssembly): string {
  const parts = [assembly.header.replace(/\*/g, ''), assembly.nominator_quote]
  if (assembly.outcome) parts.push(assembly.outcome)
  if (assembly.scope_note_line) parts.push(assembly.scope_note_line)
  return parts.join(' — ')
}

function describeApproverRole(approver: Employee, tier: number): string {
  if (tier === 3) return 'on behalf of the committee'
  if (tier === 2) {
    if (approver.is_department_head && approver.department) {
      return `${approver.department} lead`
    }
    if (approver.is_people_team_rep) return 'People team'
  }
  return approver.role_title
}

// ─── Assembly from a nomination id ───────────────────────────────────────────

async function loadAssemblyContext(nom: NominationRecord): Promise<{
  assembly: PostAssembly
  nominee: Employee
} | null> {
  const [nominator, nominee] = await Promise.all([
    getEmployeeById(nom.nominator_id),
    getEmployeeById(nom.nominee_id),
  ])
  if (!nominator || !nominee) return null
  const value = getValueById(nom.value_id)
  if (!value) return null

  const reward = await getRewardForNomination(nom.id)
  const approver = await resolveAttributedApprover(nom)

  const assembly = buildPostAssembly({
    nomination: nom,
    nominator,
    nominee,
    value_name: value.name,
    approver,
    scope_note_text: reward?.scope_note_text ?? null,
  })
  return { assembly, nominee }
}

// Spec §9.6 — scope note attribution pulls from the last "approve" action.
// For Tier 2 that's the People team rep confirming (the signing role). For
// Tier 3 we use any committee member; the role string normalizes to
// "on behalf of the committee" above.
async function resolveAttributedApprover(
  nom: NominationRecord
): Promise<Employee | null> {
  const actions = await listActions(nom.id)
  const approves = actions.filter((a) => a.action === 'approve')
  const last = approves[approves.length - 1]
  if (!last) return null
  return getEmployeeById(last.actor_id)
}

// ─── Visibility gate + send ──────────────────────────────────────────────────

function slackEnabled(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN)
}

function madeItHappenChannel(): string | null {
  return process.env.SLACK_MADE_IT_HAPPEN_CHANNEL_ID ?? null
}

// Spec §11.5 — three visibility branches:
//   public    → post to #made-it-happen
//   team_only → v1 has no wired team channels, so this falls back to
//               private (no public post). Flip when team channels land.
//   private   → no public post (DM + digest still happen)
export type VisibilityOutcome = 'posted' | 'skipped_private' | 'skipped_team_only'

export interface SendPostResult {
  message_ts: string | null
  outcome: VisibilityOutcome | 'skipped_unconfigured' | 'skipped_missing_context'
}

export async function sendMadeItHappenPost(
  nom: NominationRecord
): Promise<SendPostResult> {
  const ctx = await loadAssemblyContext(nom)
  if (!ctx) return { message_ts: null, outcome: 'skipped_missing_context' }

  const pref = ctx.nominee.recognition_preference
  if (pref === 'private') return { message_ts: null, outcome: 'skipped_private' }
  if (pref === 'team_only') return { message_ts: null, outcome: 'skipped_team_only' }

  const channel = madeItHappenChannel()
  if (!slackEnabled() || !channel) {
    return { message_ts: null, outcome: 'skipped_unconfigured' }
  }

  try {
    const res = await getSlackClient().chat.postMessage({
      channel,
      blocks: buildPostBlocks(ctx.assembly),
      text: buildPostFallbackText(ctx.assembly),
    })
    return { message_ts: res.ts ?? null, outcome: 'posted' }
  } catch (err) {
    console.error('[slack] #made-it-happen post failed', err)
    return { message_ts: null, outcome: 'skipped_unconfigured' }
  }
}

// PostSender wrapper — plugs into ack.firePostIfReady / runPostSweep.
export const realPostSender: PostSender = async (nom) => {
  const { message_ts } = await sendMadeItHappenPost(nom)
  return { message_ts }
}
