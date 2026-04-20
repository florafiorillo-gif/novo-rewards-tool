'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { approveNomination } from '@/modules/approvals/service'
import type { ReflectionType } from '@/modules/approvals/types'
import {
  cancelNomination,
  createNomination,
} from '@/modules/nominations/service'
import { getEmployeeById } from '@/modules/employees/service'
import { sendApproverDM } from '@/modules/integrations/slack/notifications'

const REFLECTION_TYPES: readonly ReflectionType[] = [
  'FIRST_RECOGNITION',
  'SPECIFIC_MOMENT',
  'BROADER_PATTERN',
  'OTHER',
] as const

function isReflectionType(v: string): v is ReflectionType {
  return (REFLECTION_TYPES as readonly string[]).includes(v)
}

export type SubmitState = {
  ok: boolean
  fieldErrors?: Partial<Record<
    'nominee_id' | 'value_id' | 'behavior_text' | 'outcome_text' | 'evidence_links' | 'reflection_type',
    string
  >>
  formError?: string
}

const INITIAL: SubmitState = { ok: false }

function errorStateForIssue(path: string, message: string): SubmitState {
  const field = path as keyof NonNullable<SubmitState['fieldErrors']>
  return { ok: false, fieldErrors: { [field]: message } as SubmitState['fieldErrors'] }
}

export async function submitNominationAction(
  _prev: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  const session = await auth()
  const nominatorId = session?.user?.employeeId
  if (!nominatorId) {
    return { ok: false, formError: 'Please sign in again — your session expired.' }
  }

  const evidence = [
    formData.get('evidence_1'),
    formData.get('evidence_2'),
    formData.get('evidence_3'),
  ]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)

  const nomineeId = (formData.get('nominee_id') ?? '').toString()
  const reflectionRaw = (formData.get('reflection_type') ?? '').toString().trim()

  const input = {
    nominee_id: nomineeId,
    value_id: (formData.get('value_id') ?? '').toString(),
    behavior_text: (formData.get('behavior_text') ?? '').toString(),
    outcome_text: (formData.get('outcome_text') ?? '').toString(),
    evidence_links: evidence,
  }

  const result = await createNomination(input, nominatorId)
  if (!result.ok) return mapCreateError(result.error)

  // Self-approval path (spec §7.2). When the nominator is the nominee's
  // manager, the submission flow collapses into a single step: the reflection
  // dropdown is required and the nomination is approved immediately.
  const nominee = await getEmployeeById(result.nomination.nominee_id)
  const isSelfApproval = nominee?.manager_id === nominatorId

  if (isSelfApproval) {
    if (!reflectionRaw) {
      return errorStateForIssue(
        'reflection_type',
        'Pick a reflection so we can track manager-to-direct patterns.'
      )
    }
    if (!isReflectionType(reflectionRaw)) {
      return errorStateForIssue('reflection_type', 'Choose one of the listed options.')
    }
    const approveResult = await approveNomination({
      nomination_id: result.nomination.id,
      actor_id: nominatorId,
      reflection_type: reflectionRaw,
    })
    if (!approveResult.ok) {
      return {
        ok: false,
        formError:
          "Your nomination was saved but we couldn't complete the self-approval. " +
          'Open it in the dashboard to finish.',
      }
    }
    redirect(`/nominations/submitted?id=${result.nomination.id}`)
  }

  // Peer / skip-level path — notify the nominee's manager over Slack if the
  // route has an approver. People-team-queue fallback has no DM recipient.
  if (result.nomination.current_approver_id) {
    void sendApproverDM(result.nomination)
  }

  redirect(`/nominations/submitted?id=${result.nomination.id}`)
}

function mapCreateError(error: { code: string; issues?: unknown[] }): SubmitState {
  switch (error.code) {
    case 'self_nomination':
      return errorStateForIssue(
        'nominee_id',
        "You can't recognize yourself — pick a teammate who showed up for you."
      )
    case 'nominee_not_found':
    case 'nominee_inactive':
      return errorStateForIssue(
        'nominee_id',
        "That teammate isn't in our directory. Please pick someone else."
      )
    case 'nominator_not_found':
      return {
        ok: false,
        formError:
          "We couldn't find your record in our directory. Please reach out to the People team.",
      }
    case 'value_not_found':
      return errorStateForIssue('value_id', 'Please choose one of the four values.')
    case 'validation': {
      const fieldErrors: SubmitState['fieldErrors'] = {}
      for (const issue of (error.issues as { path: (string | number)[]; message: string }[]) ?? []) {
        const field = issue.path[0]
        if (
          field === 'nominee_id' ||
          field === 'value_id' ||
          field === 'behavior_text' ||
          field === 'outcome_text' ||
          field === 'evidence_links'
        ) {
          fieldErrors[field] = issue.message
        }
      }
      return { ok: false, fieldErrors }
    }
    default:
      return { ok: false, formError: "We couldn't submit that. Please try again." }
  }
}

export const submitNominationInitialState: SubmitState = INITIAL

// Used by the confirmation page's "cancel within 24h" button.
export async function cancelNominationAction(nominationId: string): Promise<void> {
  const session = await auth()
  const actorId = session?.user?.employeeId
  if (!actorId) throw new Error('Not authenticated')

  const result = await cancelNomination(nominationId, actorId)
  if (!result.ok) {
    // Silent — /nominations/submitted re-reads state and shows whatever status
    // the record is now in. Fine for Phase 2/3.
  }
  redirect('/nominations/new')
}
