import type { NominationRecord } from '@/modules/nominations/types'
import * as copy from '../copy'

export const ACTION_APPROVE_T1 = 'approve_t1'
export const ACTION_PROPOSE_UPGRADE_T1 = 'propose_upgrade_t1'
export const ACTION_REVIEW_AND_DECIDE_T1 = 'review_and_decide_t1'

export function buildApproverDM(args: {
  nomination: NominationRecord
  nominator_name: string
  nominee_name: string
  value_name: string
}) {
  const { nomination, nominator_name, nominee_name, value_name } = args
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: copy.approverDMHeader(nominator_name, nominee_name, value_name),
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: copy.approverDMNarrative(
          nomination.behavior_text,
          nomination.outcome_text
        ),
      },
    },
    {
      type: 'actions',
      block_id: 'approver_actions',
      elements: [
        {
          type: 'button',
          action_id: ACTION_APPROVE_T1,
          text: { type: 'plain_text', text: copy.buttonApprove },
          style: 'primary',
          value: nomination.id,
        },
        {
          type: 'button',
          action_id: ACTION_PROPOSE_UPGRADE_T1,
          text: { type: 'plain_text', text: copy.buttonProposeUpgrade },
          value: nomination.id,
        },
        {
          type: 'button',
          action_id: ACTION_REVIEW_AND_DECIDE_T1,
          text: { type: 'plain_text', text: copy.buttonReviewAndDecide },
          value: nomination.id,
        },
      ],
    },
  ]
}
