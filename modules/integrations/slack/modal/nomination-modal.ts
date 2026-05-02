import type { ModalView } from '@slack/types'
import { VALUES, getValueById } from '@/modules/values/constants'
import * as copy from '../copy'

// Block/action identifiers. Centralized so the submission handler can read
// state.values without string-matching drift.
export const NOMINATION_CALLBACK_ID = 'nomination_submit'

export const BLOCK_NOMINEE = 'nominee_block'
export const ACTION_NOMINEE = 'nominee_select'

export const BLOCK_VALUE = 'value_block'
export const ACTION_VALUE = 'value_select'

export const BLOCK_BEHAVIOR = 'behavior_block'
export const ACTION_BEHAVIOR = 'behavior_input'

export const BLOCK_OUTCOME = 'outcome_block'
export const ACTION_OUTCOME = 'outcome_input'

export const BLOCK_EVIDENCE_PREFIX = 'evidence_block_'
export const ACTION_EVIDENCE_PREFIX = 'evidence_input_'

export function buildNominationModal(opts: {
  selectedValueId?: string
} = {}): ModalView {
  const selected = opts.selectedValueId ? getValueById(opts.selectedValueId) : null
  const behaviorPlaceholder =
    selected?.behavior_placeholder ?? copy.nominationModalBehaviorDefaultPlaceholder

  return {
    type: 'modal',
    callback_id: NOMINATION_CALLBACK_ID,
    title: { type: 'plain_text', text: copy.nominationModalTitle },
    submit: { type: 'plain_text', text: copy.nominationModalSubmit },
    close: { type: 'plain_text', text: copy.nominationModalCancel },
    blocks: [
      {
        type: 'input',
        block_id: BLOCK_NOMINEE,
        label: { type: 'plain_text', text: copy.nominationModalNomineeLabel },
        element: {
          type: 'users_select',
          action_id: ACTION_NOMINEE,
          placeholder: {
            type: 'plain_text',
            text: copy.nominationModalNomineePlaceholder,
          },
        },
      },
      {
        type: 'input',
        block_id: BLOCK_VALUE,
        // dispatch_action makes the select fire block_actions so we can swap
        // the behavior placeholder per value (spec §6.2).
        dispatch_action: true,
        label: { type: 'plain_text', text: copy.nominationModalValueLabel },
        element: {
          type: 'static_select',
          action_id: ACTION_VALUE,
          placeholder: {
            type: 'plain_text',
            text: copy.nominationModalValuePlaceholder,
          },
          options: VALUES.map((v) => ({
            text: { type: 'plain_text', text: v.name },
            value: v.id,
          })),
          ...(selected
            ? {
                initial_option: {
                  text: { type: 'plain_text', text: selected.name },
                  value: selected.id,
                },
              }
            : {}),
        },
      },
      {
        type: 'input',
        block_id: BLOCK_BEHAVIOR,
        label: { type: 'plain_text', text: copy.nominationModalBehaviorLabel },
        hint: { type: 'plain_text', text: copy.nominationModalBehaviorHint },
        element: {
          type: 'plain_text_input',
          action_id: ACTION_BEHAVIOR,
          multiline: true,
          min_length: 30,
          max_length: 500,
          placeholder: { type: 'plain_text', text: behaviorPlaceholder },
        },
      },
      {
        type: 'input',
        block_id: BLOCK_OUTCOME,
        label: { type: 'plain_text', text: copy.nominationModalOutcomeLabel },
        hint: { type: 'plain_text', text: copy.nominationModalOutcomeHint },
        element: {
          type: 'plain_text_input',
          action_id: ACTION_OUTCOME,
          multiline: true,
          min_length: 30,
          max_length: 500,
        },
      },
      { type: 'divider' },
      ...[1, 2, 3].map((n) => ({
        type: 'input' as const,
        block_id: `${BLOCK_EVIDENCE_PREFIX}${n}`,
        optional: true,
        label: {
          type: 'plain_text' as const,
          text: copy.nominationModalEvidenceLabel(n),
        },
        element: {
          type: 'url_text_input' as const,
          action_id: `${ACTION_EVIDENCE_PREFIX}${n}`,
        },
      })),
    ],
  }
}
