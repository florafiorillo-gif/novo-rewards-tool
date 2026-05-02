import { createNomination } from '@/modules/nominations/service'
import {
  ensureCanInitiateTieredNomination,
  TIERED_AUTHZ_MESSAGE,
} from '@/modules/nominations/authz'
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
import * as copy from '../copy'
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
    return modalError({ [BLOCK_NOMINEE]: copy.actorNotIdentified })
  }

  const [nominator, nominee] = await Promise.all([
    resolveSlackUserToEmployee(slackNominatorId),
    slackNomineeId ? resolveSlackUserToEmployee(slackNomineeId) : Promise.resolve(null),
  ])

  if (!nominator) {
    return modalError({ [BLOCK_NOMINEE]: copy.actorNotFound })
  }
  if (!slackNomineeId || !nominee) {
    return modalError({
      [BLOCK_NOMINEE]: copy.nominationModalErrorMissingTeammate,
    })
  }

  // Real-role authz: tiered nomination submission is manager-only.
  // The slash command also gates on this, but check here too —
  // defence in depth in case the modal was opened from a stale
  // trigger_id by a now-non-manager actor, or was reached via some
  // other path that skipped the slash-command gate.
  const authz = await ensureCanInitiateTieredNomination(nominator.id)
  if (!authz.ok) {
    return modalError({ [BLOCK_NOMINEE]: TIERED_AUTHZ_MESSAGE })
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
    const firstName = nominator.name.split(' ')[0] ?? nominator.name
    await getSlackClient().chat.postMessage({
      channel: slackNominatorId,
      text: copy.nominatorSubmitConfirmation(firstName, nominee.name),
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
    case 'not_authorized':
      return modalError({ [BLOCK_NOMINEE]: TIERED_AUTHZ_MESSAGE })
    case 'self_nomination':
      return modalError({
        [BLOCK_NOMINEE]: copy.nominationModalErrorSelfNomination,
      })
    case 'nominee_not_found':
    case 'nominee_inactive':
      return modalError({
        [BLOCK_NOMINEE]: copy.nominationModalErrorNomineeNotFound,
      })
    case 'value_not_found':
      return modalError({
        [BLOCK_VALUE]: copy.nominationModalErrorValueNotFound,
      })
    case 'validation':
      return modalError({
        [BLOCK_BEHAVIOR]: copy.nominationModalErrorValidation,
      })
    default:
      return modalError({
        [BLOCK_BEHAVIOR]: copy.nominationModalErrorGeneric,
      })
  }
}
