import {
  ACTION_APPROVE_T1,
  ACTION_PROPOSE_UPGRADE_T1,
  ACTION_REVIEW_AND_DECIDE_T1,
  ACTION_UNDO_APPROVAL,
  onApproveButton,
  onProposeUpgradeButton,
  onReviewAndDecideButton,
  onUndoButton,
} from './approver-buttons'
import { ACTION_VALUE } from '../modal/nomination-modal'
import {
  handleNominationModalValueSelect,
  handleNominationSubmit,
  isNominationSubmission,
} from './nomination-modal-handler'
import {
  handleUpgradeSubmit,
  isUpgradeSubmission,
} from './upgrade-modal-handler'
import type {
  ResponseOrVoid,
  SlackInteractivityPayload,
} from '../payloads'

// Entry point invoked by /api/slack/interactivity with a verified + parsed
// Slack payload. Dispatches to one of the specialized handlers based on
// the payload type + action_id / callback_id.
export async function handleInteractivity(
  payload: unknown
): Promise<ResponseOrVoid> {
  if (!isInteractivityPayload(payload)) return undefined
  if (payload.type === 'block_actions') return dispatchBlockAction(payload)
  if (payload.type === 'view_submission') return dispatchViewSubmission(payload)
  return undefined
}

async function dispatchBlockAction(
  payload: SlackInteractivityPayload
): Promise<ResponseOrVoid> {
  const action = payload.actions?.[0]
  if (!action?.action_id) return

  if (action.action_id === ACTION_VALUE) {
    await handleNominationModalValueSelect(payload, action)
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

async function dispatchViewSubmission(
  payload: SlackInteractivityPayload
): Promise<ResponseOrVoid> {
  if (isNominationSubmission(payload)) return handleNominationSubmit(payload)
  if (isUpgradeSubmission(payload)) return handleUpgradeSubmit(payload)
  return undefined
}

function isInteractivityPayload(x: unknown): x is SlackInteractivityPayload {
  return typeof x === 'object' && x !== null && 'type' in x
}
