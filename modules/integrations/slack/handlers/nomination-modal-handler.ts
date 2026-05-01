import { createNomination } from '@/modules/nominations/service'
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
import { sendApproverDM } from '../notifications'
import type {
  ResponseOrVoid,
  SlackAction,
  SlackInteractivityPayload,
} from '../payloads'
import { modalError, resolveSlackUserToEmployee } from './shared'

// Called when the value-select dispatches a block_actions event. Re-opens
// the modal with the behavior_text placeholder swapped per spec §6.2.
export async function handleNominationModalValueSelect(
  payload: SlackInteractivityPayload,
  action: SlackAction
): Promise<void> {
  const viewId = payload.view?.id
  if (!viewId) return
  const selectedValueId = action.selected_option?.value
  try {
    await getSlackClient().views.update({
      view_id: viewId,
      hash: payload.view?.hash,
      view: buildNominationModal({ selectedValueId }),
    })
  } catch (err) {
    console.error('[slack] nomination modal update failed', err)
  }
}

export function isNominationSubmission(
  payload: SlackInteractivityPayload
): boolean {
  return payload.view?.callback_id === NOMINATION_CALLBACK_ID
}

// view_submission for the four-field nomination modal.
export async function handleNominationSubmit(
  payload: SlackInteractivityPayload
): Promise<ResponseOrVoid> {
  const state = payload.view?.state?.values ?? {}
  const slackNomineeId = state[BLOCK_NOMINEE]?.[ACTION_NOMINEE]?.selected_user
  const valueId =
    state[BLOCK_VALUE]?.[ACTION_VALUE]?.selected_option?.value
  const behaviorText = state[BLOCK_BEHAVIOR]?.[ACTION_BEHAVIOR]?.value ?? ''
  const outcomeText = state[BLOCK_OUTCOME]?.[ACTION_OUTCOME]?.value ?? ''
  const evidenceLinks = [1, 2, 3]
    .map(
      (n) =>
        state[`${BLOCK_EVIDENCE_PREFIX}${n}`]?.[`${ACTION_EVIDENCE_PREFIX}${n}`]
          ?.value
    )
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

  const slackNominatorId = payload.user?.id
  if (!slackNominatorId) {
    return modalError({
      [BLOCK_NOMINEE]: "We couldn't identify you in Slack. Try again.",
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

  if (!result.ok) return mapCreateErrorToModalError(result.error.code)

  // Nominator confirmation DM (§9.1).
  try {
    const firstName = nominator.name.split(' ')[0]
    await getSlackClient().chat.postMessage({
      channel: slackNominatorId,
      text: `Thank you, ${firstName}. Your nomination has been submitted. ${nominee.name} will be recognized if approved.`,
    })
  } catch (err) {
    console.error('[slack] nominator confirmation DM failed', err)
  }

  // Peer-routed Tier 1: DM the nominee's manager. Self-approval routes to
  // the web path so there's no approver DM here.
  if (
    result.nomination.current_approver_id &&
    result.nomination.current_approver_id !== nominator.id
  ) {
    await sendApproverDM(result.nomination)
  }

  return { response_action: 'clear' }
}

function mapCreateErrorToModalError(code: string): ResponseOrVoid {
  switch (code) {
    case 'self_nomination':
      return modalError({ [BLOCK_NOMINEE]: "You can't recognize yourself." })
    case 'nominee_not_found':
    case 'nominee_inactive':
      return modalError({ [BLOCK_NOMINEE]: "That teammate isn't in our directory." })
    case 'value_not_found':
      return modalError({ [BLOCK_VALUE]: 'Please choose one of the four values.' })
    case 'validation':
      return modalError({
        [BLOCK_BEHAVIOR]:
          'Behavior and outcome each need at least 30 characters and at most 500. Please adjust and resubmit.',
      })
    default:
      return modalError({
        [BLOCK_BEHAVIOR]:
          "We couldn't submit your nomination. Please try again. If this keeps happening, reach out to the People team.",
      })
  }
}
