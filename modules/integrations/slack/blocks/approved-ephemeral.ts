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
        text:
          `Approved. *${args.nominee_name}* will be recognized for *${args.value_name}*.\n` +
          `_Undo is available for 10 minutes._`,
      },
    },
    {
      type: 'actions',
      block_id: 'undo_actions',
      elements: [
        {
          type: 'button',
          action_id: ACTION_UNDO_APPROVAL,
          text: { type: 'plain_text', text: 'Undo' },
          value: args.nomination_id,
        },
      ],
    },
  ]
}
