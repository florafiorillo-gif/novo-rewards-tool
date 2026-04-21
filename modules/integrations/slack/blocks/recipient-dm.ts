export const ACTION_ACKNOWLEDGE_RECOGNITION = 'acknowledge_recognition'

export function buildRecipientDMBlocks(args: {
  nomination_id: string
  nominee_name: string
  nominator_name: string
  value_name: string
  behavior_text: string
  reward_line: string
  delivery_line: string
  already_acknowledged: boolean
}) {
  const {
    nomination_id,
    nominee_name,
    nominator_name,
    value_name,
    behavior_text,
    reward_line,
    delivery_line,
    already_acknowledged,
  } = args

  const headerBlocks = [
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text:
          `${nominee_name}, you've been recognized.\n` +
          `${nominator_name} saw you live *${value_name}*:\n` +
          `_"${behavior_text}"_`,
      },
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `Your reward: ${reward_line}.\n${delivery_line}`,
      },
    },
  ]

  if (already_acknowledged) {
    return [
      ...headerBlocks,
      {
        type: 'context' as const,
        elements: [
          {
            type: 'mrkdwn' as const,
            text: '_Acknowledged — your recognition has been shared._',
          },
        ],
      },
    ]
  }
  return [
    ...headerBlocks,
    {
      type: 'actions' as const,
      block_id: 'recipient_ack',
      elements: [
        {
          type: 'button' as const,
          action_id: ACTION_ACKNOWLEDGE_RECOGNITION,
          text: { type: 'plain_text' as const, text: 'React to acknowledge' },
          style: 'primary' as const,
          value: nomination_id,
        },
      ],
    },
  ]
}
