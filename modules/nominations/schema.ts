import { z } from 'zod'
import { VALUE_IDS } from '@/modules/values/constants'

// Shared by the Slack modal submission and the web fallback form (spec §6.2).
// Warm-tone copy; Rubina owns the pre-launch copy pass.
export const NominationInputSchema = z.object({
  nominee_id: z.string().min(1, 'Please pick someone to recognize.'),
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
})

export type NominationInput = z.infer<typeof NominationInputSchema>
