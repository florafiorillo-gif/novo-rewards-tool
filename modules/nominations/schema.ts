import { z } from 'zod'
import { VALUE_IDS } from '@/modules/values/constants'

// Shared by the Slack modal submission and the web fallback form (spec §6.2).
// Warm-tone copy; Rubina owns the pre-launch copy pass.

// Common narrative fields used by both single- and group-nomination
// shapes. Pulled into one place so behavior/outcome validation copy
// stays identical across the two paths.
const NominationNarrativeShape = {
  value_id: z
    .string()
    .refine((v) => VALUE_IDS.has(v), 'Please choose one of the four values.'),
  behavior_text: z
    .string()
    .trim()
    .min(30, 'A little more detail helps — at least 30 characters.')
    .max(500, 'Keep it to 500 characters or fewer.'),
  outcome_text: z
    .string()
    .trim()
    .min(30, 'A little more detail helps — at least 30 characters.')
    .max(500, 'Keep it to 500 characters or fewer.'),
  evidence_links: z
    .array(
      z
        .string()
        .url('Each evidence link needs to be a valid URL.')
        // Reject javascript:, data:, file:, vbscript: and similar schemes —
        // Zod's .url() accepts them because WHATWG URL does, and we render
        // these as <a href> in ApprovalCard / CommitteeCard (reviewer-side
        // stored XSS vector otherwise).
        .refine(
          (v) => /^https?:\/\//i.test(v),
          'Evidence links must start with http:// or https://.'
        )
    )
    .max(3, 'Up to three evidence links.')
    .optional()
    .default([]),
} as const

export const NominationInputSchema = z.object({
  nominee_id: z.string().min(1, 'Please pick someone to recognize.'),
  ...NominationNarrativeShape,
})

export type NominationInput = z.infer<typeof NominationInputSchema>

// Group-nomination input: one form submission, up to 10 recipients
// recognized for the same story. Fans out into N independent
// nominations sharing a group_id (see createGroupNomination).
export const GroupNominationInputSchema = z.object({
  nominee_ids: z
    .array(z.string().min(1))
    .min(1, 'Pick at least one teammate to recognize.')
    .max(10, 'You can recognize up to 10 teammates in one nomination.'),
  ...NominationNarrativeShape,
})

export type GroupNominationInput = z.infer<typeof GroupNominationInputSchema>
