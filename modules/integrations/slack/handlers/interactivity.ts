import { approveNomination, proposeUpgrade, undoApproval } from '@/modules/approvals/service'
import { createNomination } from '@/modules/nominations/service'
import { getEmployeeByEmail, getEmployeeById } from '@/modules/employees/service'
import type { Employee } from '@/modules/employees/types'
import { getCommitteeMembers } from '@/modules/roles/service'
import { getValueById } from '@/modules/values/constants'
import { getSlackClient } from '../client'
import {
  ACTION_BEHAVIOR,
  ACTION_EVIDENCE_PREFIX,
  ACTION_NOMINEE,
  ACTION_OUTCOME,
  ACTION_VALUE,
  BLOCK_BEHAVIOR,
  BLOCK_EVIDENCE_PREFIX,
  BLOCK_NOMINEE,
  BLOCK_OUTCOME,
  BLOCK_VALUE,
  NOMINATION_CALLBACK_ID,
  buildNominationModal,
} from '../modal/nomination-modal'
import {
  ACTION_APPROVE_T1,
  ACTION_PROPOSE_UPGRADE_T1,
  ACTION_REVIEW_AND_DECIDE_T1,
} from '../blocks/approver-dm'
import { ACTION_UNDO_APPROVAL } from '../blocks/approved-ephemeral'
import {
  ACTION_UPGRADE_REASON,
  ACTION_UPGRADE_TIER,
  ACTION_UPGRADE_URGENT,
  BLOCK_UPGRADE_REASON,
  BLOCK_UPGRADE_TIER,
  BLOCK_UPGRADE_URGENT,
  UPGRADE_CALLBACK_ID,
  buildUpgradeModal,
} from '../blocks/upgrade-modal'
import {
  pingCommitteeUrgent,
  sendApproverDM,
  sendNominatorApprovalDM,
  updateApproverDMToApproved,
} from '../notifications'

type ResponseAction =
  | { response_action: 'clear' }
  | { response_action: 'update'; view: unknown }
  | { response_action: 'errors'; errors: Record<string, string> }

export async function handleInteractivity(payload: any): Promise<ResponseAction | undefined> {
  const type = payload?.type
  if (type === 'block_actions') return handleBlockActions(payload)
  if (type === 'view_submission') return handleViewSubmission(payload)
  return undefined
}

// ─── block_actions ───────────────────────────────────────────────────────────

async function handleBlockActions(payload: any): Promise<undefined> {
  const action = payload?.actions?.[0]
  if (!action) return

  // Modal dynamic placeholder update on value select (Phase 2).
  if (action.action_id === ACTION_VALUE && payload?.view?.id) {
    const selectedValueId = action.selected_option?.value as string | undefined
    await getSlackClient().views.update({
      view_id: payload.view.id,
      hash: payload.view.hash,
      view: buildNominationModal({ selectedValueId }),
    })
    return
  }

  if (action.action_id === ACTION_APPROVE_T1) {
    await onApproveButton(payload)
    return
  }
  if (action.action_id === ACTION_PROPOSE_UPGRADE_T1) {
    await onProposeUpgradeButton(payload)
    return
  }
  if (action.action_id === ACTION_REVIEW_AND_DECIDE_T1) {
    await onReviewAndDecideButton(payload)
    return
  }
  if (action.action_id === ACTION_UNDO_APPROVAL) {
    await onUndoButton(payload)
    return
  }
}

async function onApproveButton(payload: any): Promise<void> {
  const nominationId = payload.actions[0].value as string
  const slackUserId = payload.user?.id as string | undefined
  const actor = slackUserId ? await resolveSlackUserToEmployee(slackUserId) : null
  if (!actor) {
    await respondEphemeral(payload, "We couldn't find your record in our directory.")
    return
  }

  const result = await approveNomination({
    nomination_id: nominationId,
    actor_id: actor.id,
  })
  if (!result.ok) {
    await respondEphemeral(payload, errorTextForApprove(result.error.code))
    return
  }

  const [nominator, nominee] = await Promise.all([
    getEmployeeById(result.nomination.nominator_id),
    getEmployeeById(result.nomination.nominee_id),
  ])
  const value = getValueById(result.nomination.value_id)

  const channel = payload.container?.channel_id ?? payload.channel?.id
  const ts = payload.container?.message_ts ?? payload.message?.ts
  if (channel && ts && nominee && value) {
    await updateApproverDMToApproved({
      channel,
      ts,
      nominee_name: nominee.name,
      value_name: value.name,
      nomination_id: nominationId,
    })
  }

  // Spec §9.2 — nominator DM only when nominator != actor.
  if (nominator && nominee && value && nominator.id !== actor.id) {
    await sendNominatorApprovalDM({
      nomination: result.nomination,
      nominator_name: nominator.name,
      nominator_email: nominator.email,
      nominee_name: nominee.name,
      value_name: value.name,
    })
  }
}

async function onProposeUpgradeButton(payload: any): Promise<void> {
  const nominationId = payload.actions[0].value as string
  const triggerId = payload.trigger_id as string | undefined
  if (!triggerId) return
  await getSlackClient().views.open({
    trigger_id: triggerId,
    view: buildUpgradeModal({ nomination_id: nominationId, from_tier: 1 }),
  })
}

async function onReviewAndDecideButton(payload: any): Promise<void> {
  const nominationId = payload.actions[0].value as string
  // Spec §7.1 says "review and decide" opens a full view. For Phase 3 we
  // route to the web approvals queue which is already richer (nominee and
  // nominator history, deny-with-reason, request-more-info).
  const base = process.env.AUTH_URL ?? 'http://localhost:3000'
  const url = `${base}/approvals/queue?nomination_id=${encodeURIComponent(nominationId)}`
  await respondEphemeral(
    payload,
    `Opening in the approvals dashboard: ${url}`
  )
}

async function onUndoButton(payload: any): Promise<void> {
  const nominationId = payload.actions[0].value as string
  const slackUserId = payload.user?.id as string | undefined
  const actor = slackUserId ? await resolveSlackUserToEmployee(slackUserId) : null
  if (!actor) {
    await respondEphemeral(payload, "We couldn't find your record in our directory.")
    return
  }
  const result = await undoApproval({
    nomination_id: nominationId,
    actor_id: actor.id,
  })
  if (!result.ok) {
    await respondEphemeral(payload, errorTextForUndo(result.error.code))
    return
  }
  const channel = payload.container?.channel_id ?? payload.channel?.id
  const ts = payload.container?.message_ts ?? payload.message?.ts
  if (channel && ts) {
    try {
      await getSlackClient().chat.update({
        channel,
        ts,
        text: 'Undone — waiting for your decision.',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '_Undone. The nomination is back in your queue; open it again when you\'re ready._',
            },
          },
        ],
      })
    } catch {
      // Silent.
    }
  }
}

// ─── view_submission ─────────────────────────────────────────────────────────

async function handleViewSubmission(payload: any): Promise<ResponseAction | undefined> {
  const callback = payload?.view?.callback_id
  if (callback === NOMINATION_CALLBACK_ID) return handleNominationSubmit(payload)
  if (callback === UPGRADE_CALLBACK_ID) return handleUpgradeSubmit(payload)
  return undefined
}

async function handleNominationSubmit(payload: any): Promise<ResponseAction | undefined> {
  const state = payload.view.state?.values ?? {}
  const slackNomineeId: string | undefined =
    state[BLOCK_NOMINEE]?.[ACTION_NOMINEE]?.selected_user
  const valueId: string | undefined =
    state[BLOCK_VALUE]?.[ACTION_VALUE]?.selected_option?.value
  const behaviorText: string = state[BLOCK_BEHAVIOR]?.[ACTION_BEHAVIOR]?.value ?? ''
  const outcomeText: string = state[BLOCK_OUTCOME]?.[ACTION_OUTCOME]?.value ?? ''
  const evidenceLinks = [1, 2, 3]
    .map(
      (n) =>
        state[`${BLOCK_EVIDENCE_PREFIX}${n}`]?.[`${ACTION_EVIDENCE_PREFIX}${n}`]?.value as
          | string
          | undefined
    )
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

  const slackNominatorId: string | undefined = payload?.user?.id
  if (!slackNominatorId) {
    return modalError({
      [BLOCK_NOMINEE]: "Hmm — we couldn't identify you in Slack. Try again.",
    })
  }

  const [nominator, nominee] = await Promise.all([
    resolveSlackUserToEmployee(slackNominatorId),
    slackNomineeId ? resolveSlackUserToEmployee(slackNomineeId) : Promise.resolve(null),
  ])

  if (!nominator) {
    return modalError({
      [BLOCK_NOMINEE]: "We couldn't find your record in our directory.",
    })
  }
  if (!slackNomineeId || !nominee) {
    return modalError({
      [BLOCK_NOMINEE]: "We couldn't find that teammate in our directory.",
    })
  }

  const result = await createNomination(
    {
      nominee_id: nominee.id,
      value_id: valueId ?? '',
      behavior_text: behaviorText,
      outcome_text: outcomeText,
      evidence_links: evidenceLinks,
    },
    nominator.id
  )

  if (!result.ok) return mapCreateErrorToModalError(result.error)

  // Nominator confirmation DM (§9.1).
  try {
    const firstName = nominator.name.split(' ')[0]
    await getSlackClient().chat.postMessage({
      channel: slackNominatorId,
      text: `Thank you, ${firstName}. Your nomination has been submitted. ${nominee.name} will be recognized if approved.`,
    })
  } catch {
    // Silent.
  }

  // Tier 1 peer DM to the nominee's manager (no DM if routed to People team
  // queue or if self-approval — self-approval is handled via the web path).
  if (result.nomination.current_approver_id && result.nomination.current_approver_id !== nominator.id) {
    await sendApproverDM(result.nomination)
  }

  return { response_action: 'clear' }
}

async function handleUpgradeSubmit(payload: any): Promise<ResponseAction | undefined> {
  const meta = safeParseMetadata(payload.view.private_metadata)
  if (!meta || typeof meta.nomination_id !== 'string') return modalError({})

  const state = payload.view.state?.values ?? {}
  const toTierStr =
    state[BLOCK_UPGRADE_TIER]?.[ACTION_UPGRADE_TIER]?.selected_option?.value
  const reasoning: string =
    state[BLOCK_UPGRADE_REASON]?.[ACTION_UPGRADE_REASON]?.value ?? ''
  const urgentChecked =
    Array.isArray(
      state[BLOCK_UPGRADE_URGENT]?.[ACTION_UPGRADE_URGENT]?.selected_options
    ) &&
    state[BLOCK_UPGRADE_URGENT][ACTION_UPGRADE_URGENT].selected_options.length > 0

  const toTier = toTierStr === '2' ? 2 : toTierStr === '3' ? 3 : null
  if (!toTier) {
    return modalError({ [BLOCK_UPGRADE_TIER]: 'Choose a target tier.' })
  }

  const slackUserId: string | undefined = payload?.user?.id
  const actor = slackUserId ? await resolveSlackUserToEmployee(slackUserId) : null
  if (!actor) {
    return modalError({ [BLOCK_UPGRADE_REASON]: "We couldn't find your record." })
  }

  const result = await proposeUpgrade({
    nomination_id: meta.nomination_id,
    actor_id: actor.id,
    to_tier: toTier as 2 | 3,
    reasoning,
    urgent: toTier === 3 ? urgentChecked : false,
  })

  if (!result.ok) {
    return modalError({
      [BLOCK_UPGRADE_REASON]: errorTextForProposeUpgrade(result.error.code),
    })
  }

  // Tier 2 target: DM both snapshot approvers. Tier 3 + urgent: ping committee.
  if (result.nomination.current_tier === 2) {
    if (result.nomination.tier2_dept_head_id) {
      await sendApproverDM({
        ...result.nomination,
        current_approver_id: result.nomination.tier2_dept_head_id,
      })
    }
    if (result.nomination.tier2_people_team_rep_id) {
      await sendApproverDM({
        ...result.nomination,
        current_approver_id: result.nomination.tier2_people_team_rep_id,
      })
    }
  } else if (result.nomination.current_tier === 3 && result.nomination.urgent) {
    const nominee = await getEmployeeById(result.nomination.nominee_id)
    const value = getValueById(result.nomination.value_id)
    const committee = await getCommitteeMembers()
    if (nominee) {
      await pingCommitteeUrgent({
        nomination_id: result.nomination.id,
        nominee_name: nominee.name,
        value_name: value?.name ?? 'a Novo value',
        committee_emails: committee.map((m) => m.email),
      })
    }
  }

  return { response_action: 'clear' }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function resolveSlackUserToEmployee(slackUserId: string): Promise<Employee | null> {
  const info = await getSlackClient().users.info({ user: slackUserId })
  const email = info.user?.profile?.email
  if (!email) return null
  return getEmployeeByEmail(email)
}

function safeParseMetadata(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    return null
  } catch {
    return null
  }
}

function modalError(errors: Record<string, string>): ResponseAction {
  return { response_action: 'errors', errors }
}

function mapCreateErrorToModalError(error: { code: string }): ResponseAction {
  switch (error.code) {
    case 'self_nomination':
      return modalError({ [BLOCK_NOMINEE]: "You can't recognize yourself." })
    case 'nominee_not_found':
    case 'nominee_inactive':
      return modalError({ [BLOCK_NOMINEE]: "That teammate isn't in our directory." })
    case 'value_not_found':
      return modalError({ [BLOCK_VALUE]: 'Please choose one of the four values.' })
    case 'validation':
      return modalError({
        [BLOCK_BEHAVIOR]: 'Something looks off — check the length and try again.',
      })
    default:
      return modalError({ [BLOCK_BEHAVIOR]: "We couldn't submit that. Try again." })
  }
}

function errorTextForApprove(code: string): string {
  switch (code) {
    case 'wrong_status':
      return 'This nomination has already been acted on.'
    case 'forbidden':
      return "You aren't the approver for this nomination."
    case 'reflection_required':
      return 'This is a self-approval — please use the web form so you can choose a reflection type.'
    default:
      return "Couldn't approve right now. Try again in a minute."
  }
}

function errorTextForUndo(code: string): string {
  switch (code) {
    case 'window_expired':
      return 'The 10-minute undo window has passed. Reach out to the People team to reverse this.'
    case 'forbidden':
      return 'Only the approver can undo.'
    case 'nothing_to_undo':
      return 'There is nothing to undo on this nomination.'
    default:
      return "Couldn't undo. Try again in a minute."
  }
}

function errorTextForProposeUpgrade(code: string): string {
  switch (code) {
    case 'no_department_head':
      return "We couldn't find a department head for the nominee. Reach out to the People team."
    case 'no_people_team_rep':
      return 'No People team rep is currently available to review. Reach out to the People team.'
    case 'reasoning_required':
      return 'A short reasoning note is required.'
    case 'forbidden':
      return "You aren't authorized to propose an upgrade."
    default:
      return "Couldn't send for review. Try again."
  }
}

async function respondEphemeral(payload: any, text: string): Promise<void> {
  const responseUrl = payload.response_url as string | undefined
  if (!responseUrl) return
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ response_type: 'ephemeral', text }),
    })
  } catch {
    // Silent.
  }
}
