'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import {
  cancelNomination,
  createNomination,
} from '@/modules/nominations/service'

export type SubmitState = {
  ok: boolean
  fieldErrors?: Partial<Record<
    'nominee_id' | 'value_id' | 'behavior_text' | 'outcome_text' | 'evidence_links',
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

  const input = {
    nominee_id: (formData.get('nominee_id') ?? '').toString(),
    value_id: (formData.get('value_id') ?? '').toString(),
    behavior_text: (formData.get('behavior_text') ?? '').toString(),
    outcome_text: (formData.get('outcome_text') ?? '').toString(),
    evidence_links: evidence,
  }

  const result = await createNomination(input, nominatorId)

  if (result.ok) {
    redirect(`/nominations/submitted?id=${result.nomination.id}`)
  }

  const { error } = result
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
      for (const issue of error.issues) {
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
    // The page re-reads state after redirect and shows whatever status the record has.
    // Silent failure here is fine for Phase 2.
  }
  redirect('/nominations/new')
}
