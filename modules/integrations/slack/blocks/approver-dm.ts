import type { NominationRecord } from '@/modules/nominations/types'

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
        text:
          `*New recognition nomination to review.*\n` +
          `${nominator_name} recognized *${nominee_name}* for *${value_name}*.`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_"${nomination.behavior_text}"_\n\n_"${nomination.outcome_text}"_`,
      },
    },
    {
      type: 'actions',
      block_id: 'approver_actions',
      elements: [
        {
          type: 'button',
          action_id: ACTION_APPROVE_T1,
          text: { type: 'plain_text', text: 'Approve' },
          style: 'primary',
          value: nomination.id,
        },
        {
          type: 'button',
          action_id: ACTION_PROPOSE_UPGRADE_T1,
          text: { type: 'plain_text', text: 'Propose upgrade' },
          value: nomination.id,
        },
        {
          type: 'button',
          action_id: ACTION_REVIEW_AND_DECIDE_T1,
          text: { type: 'plain_text', text: 'Review and decide' },
          value: nomination.id,
        },
      ],
    },
  ]
}
