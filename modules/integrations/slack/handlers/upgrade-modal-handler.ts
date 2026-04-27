import { proposeUpgrade } from '@/modules/approvals/service'
import { getEmployeeById } from '@/modules/employees/service'
import { getCommitteeMembers } from '@/modules/roles/service'
import { getValueById } from '@/modules/values/constants'
import {
  ACTION_UPGRADE_REASON,
  ACTION_UPGRADE_TIER,
  ACTION_UPGRADE_URGENT,
  BLOCK_UPGRADE_REASON,
  BLOCK_UPGRADE_TIER,
  BLOCK_UPGRADE_URGENT,
  UPGRADE_CALLBACK_ID,
} from '../blocks/upgrade-modal'
import {
  pingCommitteeUrgent,
  sendApproverDM,
} from '../notifications'
import type {
  ResponseOrVoid,
  SlackInteractivityPayload,
} from '../payloads'
import {
  modalError,
  resolveSlackUserToEmployee,
  safeParseMetadata,
} from './shared'

export function isUpgradeSubmission(
  payload: SlackInteractivityPayload
): boolean {
  return payload.view?.callback_id === UPGRADE_CALLBACK_ID
}

// view_submission for the propose-upgrade modal. Snapshots Tier 2
// approvers (via proposeUpgrade service) and fires Slack DMs as side
// effects — per the "handlers orchestrate side effects" contract.
export async function handleUpgradeSubmit(
  payload: SlackInteractivityPayload
): Promise<ResponseOrVoid> {
  const meta = safeParseMetadata(payload.view?.private_metadata)
  if (!meta || typeof meta.nomination_id !== 'string') return modalError({})

  const state = payload.view?.state?.values ?? {}
  const toTierStr = state[BLOCK_UPGRADE_TIER]?.[ACTION_UPGRADE_TIER]?.selected_option?.value
  const reasoning = state[BLOCK_UPGRADE_REASON]?.[ACTION_UPGRADE_REASON]?.value ?? ''
  const urgentOptions =
    state[BLOCK_UPGRADE_URGENT]?.[ACTION_UPGRADE_URGENT]?.selected_options
  const urgentChecked = Array.isArray(urgentOptions) && urgentOptions.length > 0

  const toTier = toTierStr === '2' ? 2 : toTierStr === '3' ? 3 : null
  if (!toTier) {
    return modalError({ [BLOCK_UPGRADE_TIER]: 'Choose a target tier.' })
  }

  const slackUserId = payload.user?.id
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
      return "We couldn't send this nomination for review. Please try again — if this keeps happening, reach out to the People team."
  }
}
