import * as copy from '../copy'

export const ACTION_UNDO_APPROVAL = 'undo_approval'

// Shown in place of the action buttons after a Tier 1 approve click. The
// Undo button is live for 10 minutes (service enforces the window); after
// that the interactivity handler returns a graceful "too late" ephemeral.
export function buildApprovedEphemeral(args: {
  nominee_name: string
  value_name: string
  nomination_id: string
}) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: copy.approvedHeader(args.nominee_name, args.value_name),
      },
    },
    {
      type: 'actions',
      block_id: 'undo_actions',
      elements: [
        {
          type: 'button',
          action_id: ACTION_UNDO_APPROVAL,
          text: { type: 'plain_text', text: copy.buttonUndo },
          value: args.nomination_id,
        },
      ],
    },
  ]
}
