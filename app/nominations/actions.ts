'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { approveNomination } from '@/modules/approvals/service'
import type { ReflectionType } from '@/modules/approvals/types'
import {
  cancelNomination,
  createGroupNomination,
  createPeerNomination,
} from '@/modules/nominations/service'
import { getEmployeeById } from '@/modules/employees/service'
import { sendApproverDM } from '@/modules/integrations/slack/notifications'
import { sendPeerRecognitionDM } from '@/modules/integrations/slack/recipient'

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

  // The form emits one hidden <input name="nominee_ids"> per selected
  // teammate. FormData.getAll yields them as an array; the standalone
  // 'nominee_id' fallback supports any caller still posting a single
  // value (Slack modal v1, server-side scripts).
  const nomineeIds: string[] = formData
    .getAll('nominee_ids')
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)
  const legacySingle = (formData.get('nominee_id') ?? '').toString().trim()
  if (legacySingle && nomineeIds.length === 0) nomineeIds.push(legacySingle)

  const reflectionRaw = (formData.get('reflection_type') ?? '').toString().trim()

  const input = {
    nominee_ids: nomineeIds,
    value_id: (formData.get('value_id') ?? '').toString(),
    behavior_text: (formData.get('behavior_text') ?? '').toString(),
    outcome_text: (formData.get('outcome_text') ?? '').toString(),
    evidence_links: evidence,
  }

  const result = await createGroupNomination(input, nominatorId)
  if (!result.ok) return mapCreateError(result.error)

  const isGroup = result.group_id !== null

  // Single-recipient self-approval (spec §7.2) still collapses into a
  // one-step submit. Groups never self-approve — the service refuses
  // to mix direct reports into a multi-recipient submission, so the
  // reflection prompt only matters for single-row submissions.
  if (!isGroup) {
    const single = result.nominations[0]!
    const nominee = await getEmployeeById(single.nominee_id)
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
        nomination_id: single.id,
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
      redirect(`/nominations/submitted?id=${single.id}`)
    }
  }

  // Peer/skip-level: notify each recipient's manager via Slack.
  // Fan-out submissions yield N parallel DMs (one per fan-out
  // approver); existing fire-and-forget guard catches per-DM
  // failures without crashing the dev server's unhandled-rejection
  // handler. See spec note in CLAUDE.md ("Fire-and-forget Slack DM").
  for (const nom of result.nominations) {
    if (!nom.current_approver_id) continue
    sendApproverDM(nom).catch((err) => {
      console.error('[nominations] sendApproverDM failed (non-blocking):', err)
    })
  }

  if (isGroup) {
    redirect(`/nominations/submitted?group=${result.group_id}`)
  }
  redirect(`/nominations/submitted?id=${result.nominations[0]!.id}`)
}

function mapCreateError(error: { code: string; issues?: unknown[] }): SubmitState {
  switch (error.code) {
    case 'self_nomination':
      return errorStateForIssue(
        'nominee_id',
        "You can't recognize yourself — pick a teammate who showed up for you."
      )
    case 'self_approval_in_group':
      return errorStateForIssue(
        'nominee_id',
        'One of these teammates is your direct report. For now, please submit theirs separately so the self-approval reflection can be filled in.'
      )
    case 'no_recipients_remaining':
      return errorStateForIssue(
        'nominee_id',
        "None of those teammates are active in our directory. Please pick again."
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
          field === 'nominee_ids' ||
          field === 'nominee_id' ||
          field === 'value_id' ||
          field === 'behavior_text' ||
          field === 'outcome_text' ||
          field === 'evidence_links'
        ) {
          // Route nominee_ids array errors to the nominee_id field
          // slot the form already renders messages under.
          const slot = field === 'nominee_ids' ? 'nominee_id' : field
          fieldErrors[slot] = issue.message
        }
      }
      return { ok: false, fieldErrors }
    }
    default:
      return {
        ok: false,
        formError:
          "We couldn't submit your nomination. Please try again — if this keeps happening, reach out to the People team.",
      }
  }
}

// Used by the confirmation page's "cancel within 24h" button.
export async function cancelNominationAction(nominationId: string): Promise<void> {
  const session = await auth()
  const actorId = session?.user?.employeeId
  if (!actorId) throw new Error('Not authenticated')

  const result = await cancelNomination(nominationId, actorId)
  if (!result.ok) {
    // Silent — the confirmation page re-reads state and shows whatever
    // status the record is now in. Fine for Phase 2/3.
  }
  redirect('/nominations/new')
}

// ─── Peer recognition (Round 5) ──────────────────────────────────────
// Distinct submit action — no approver routing, no reward, no group
// fan-out. The createPeerNomination service enforces self-nomination,
// org-direction (no upward), and the 7-day frequency cap. On success
// we redirect to the standard confirmation page so the user sees the
// same "submitted" affordance as for tiered.

export type PeerSubmitState = {
  ok: boolean
  fieldErrors?: Partial<Record<
    'nominee_id' | 'value_id' | 'behavior_text' | 'outcome_text',
    string
  >>
  formError?: string
}

const PEER_INITIAL_STATE: PeerSubmitState = { ok: false }
export const peerInitialState: PeerSubmitState = PEER_INITIAL_STATE

export async function submitPeerRecognitionAction(
  _prev: PeerSubmitState,
  formData: FormData
): Promise<PeerSubmitState> {
  const session = await auth()
  const nominatorId = session?.user?.employeeId
  if (!nominatorId) {
    return { ok: false, formError: 'Please sign in again — your session expired.' }
  }

  const input = {
    nominee_id: (formData.get('nominee_id') ?? '').toString().trim(),
    value_id: (formData.get('value_id') ?? '').toString(),
    behavior_text: (formData.get('behavior_text') ?? '').toString(),
    outcome_text: (formData.get('outcome_text') ?? '').toString(),
  }

  const result = await createPeerNomination(input, nominatorId)
  if (!result.ok) return mapPeerError(result.error)

  // Recipient DM is fire-and-forget. If Slack isn't configured (dev/
  // mock mode) the helper returns a no-op. Wrapping in .catch is the
  // same guard the tiered flow uses for sendApproverDM — an unawaited
  // rejection after redirect would crash the dev server on Node 20+.
  sendPeerRecognitionDM({ nomination: result.nomination }).catch((err) => {
    console.error('[peer] recipient DM failed (non-blocking):', err)
  })

  redirect(`/nominations/submitted?id=${result.nomination.id}`)
}

function mapPeerError(error: {
  code: string
  issues?: unknown[]
  cap?: number
  window_days?: number
}): PeerSubmitState {
  switch (error.code) {
    case 'self_nomination':
      return {
        ok: false,
        fieldErrors: {
          nominee_id:
            "You can't recognize yourself — pick a teammate who showed up for you.",
        },
      }
    case 'nominee_not_found':
    case 'nominee_inactive':
      return {
        ok: false,
        fieldErrors: {
          nominee_id:
            "We couldn't find that teammate in our directory. Please pick again.",
        },
      }
    case 'nominator_not_found':
      return {
        ok: false,
        formError:
          "We couldn't find your record in our directory. Please reach out to the People team.",
      }
    case 'value_not_found':
      return {
        ok: false,
        fieldErrors: { value_id: 'Please choose one of the four values.' },
      }
    case 'upward_chain':
      return {
        ok: false,
        fieldErrors: {
          nominee_id:
            'You can recognize teammates and people across teams, but not your manager or anyone above them in your chain.',
        },
      }
    case 'frequency_cap': {
      const cap = error.cap ?? 3
      const win = error.window_days ?? 7
      return {
        ok: false,
        fieldErrors: {
          nominee_id: `You've already recognized this teammate ${cap} times in the last ${win} days. Try again next week or recognize someone else.`,
        },
      }
    }
    case 'validation': {
      const fieldErrors: PeerSubmitState['fieldErrors'] = {}
      for (const issue of (error.issues as { path: (string | number)[]; message: string }[]) ?? []) {
        const field = issue.path[0]
        if (
          field === 'nominee_id' ||
          field === 'value_id' ||
          field === 'behavior_text' ||
          field === 'outcome_text'
        ) {
          fieldErrors[field] = issue.message
        }
      }
      return { ok: false, fieldErrors }
    }
    default:
      return {
        ok: false,
        formError:
          "We couldn't post your peer recognition. Please try again — if this keeps happening, reach out to the People team.",
      }
  }
}
