import type { ModalView } from '@slack/types'

export const UPGRADE_CALLBACK_ID = 'upgrade_submit'
export const BLOCK_UPGRADE_TIER = 'upgrade_tier_block'
export const ACTION_UPGRADE_TIER = 'upgrade_tier_select'
export const BLOCK_UPGRADE_REASON = 'upgrade_reason_block'
export const ACTION_UPGRADE_REASON = 'upgrade_reason_input'
export const BLOCK_UPGRADE_URGENT = 'upgrade_urgent_block'
export const ACTION_UPGRADE_URGENT = 'upgrade_urgent_checkbox'

export function buildUpgradeModal(args: {
  nomination_id: string
  // Origin tier dictates which targets are offered (1 → 2 or 3; 2 → 3 only).
  from_tier: 1 | 2
}): ModalView {
  const tierOptions =
    args.from_tier === 1
      ? [
          { text: { type: 'plain_text' as const, text: 'Tier 2 — Impact' }, value: '2' },
          { text: { type: 'plain_text' as const, text: 'Tier 3 — Value Share' }, value: '3' },
        ]
      : [
          { text: { type: 'plain_text' as const, text: 'Tier 3 — Value Share' }, value: '3' },
        ]

  return {
    type: 'modal',
    callback_id: UPGRADE_CALLBACK_ID,
    private_metadata: JSON.stringify({
      nomination_id: args.nomination_id,
      from_tier: args.from_tier,
    }),
    title: { type: 'plain_text', text: 'Propose upgrade' },
    submit: { type: 'plain_text', text: 'Send for review' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: BLOCK_UPGRADE_TIER,
        label: { type: 'plain_text', text: 'Upgrade to' },
        element: {
          type: 'static_select',
          action_id: ACTION_UPGRADE_TIER,
          options: tierOptions,
          ...(tierOptions.length === 1 ? { initial_option: tierOptions[0] } : {}),
        },
      },
      {
        type: 'input',
        block_id: BLOCK_UPGRADE_REASON,
        label: { type: 'plain_text', text: 'Why does this warrant the upgrade?' },
        hint: { type: 'plain_text', text: 'A couple of sentences is plenty.' },
        element: {
          type: 'plain_text_input',
          action_id: ACTION_UPGRADE_REASON,
          multiline: true,
          min_length: 20,
          max_length: 1000,
        },
      },
      {
        type: 'input',
        block_id: BLOCK_UPGRADE_URGENT,
        optional: true,
        label: { type: 'plain_text', text: 'Urgent' },
        hint: {
          type: 'plain_text',
          text: 'Only for Tier 3. Pings Flora and Rares for an async decision.',
        },
        element: {
          type: 'checkboxes',
          action_id: ACTION_UPGRADE_URGENT,
          options: [
            {
              text: { type: 'plain_text', text: 'This is time-sensitive' },
              value: 'urgent',
            },
          ],
        },
      },
    ],
  }
}
