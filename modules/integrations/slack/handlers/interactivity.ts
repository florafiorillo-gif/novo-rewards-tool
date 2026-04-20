import { createNomination } from '@/modules/nominations/service'
import { getEmployeeByEmail } from '@/modules/employees/service'
import type { Employee } from '@/modules/employees/types'
import { getSlackClient } from '../client'
import {
  ACTION_BEHAVIOR,
  ACTION_EVIDENCE_PREFIX,
  ACTION_NOMINEE,
  ACTION_OUTCOME,
  ACTION_VALUE,
  BLOCK_BEHAVIOR,
  BLOCK_EVIDENCE_PREFIX,
  BLOCK_NOMINEE,
  BLOCK_OUTCOME,
  BLOCK_VALUE,
  NOMINATION_CALLBACK_ID,
  buildNominationModal,
} from '../modal/nomination-modal'

// Slack interactive payloads. Shape docs:
// https://api.slack.com/reference/interaction-payloads

type ResponseAction =
  | { response_action: 'clear' }
  | { response_action: 'update'; view: unknown }
  | {
      response_action: 'errors'
      errors: Record<string, string>
    }

export async function handleInteractivity(payload: any): Promise<ResponseAction | undefined> {
  const type = payload?.type
  if (type === 'block_actions') return handleBlockActions(payload)
  if (type === 'view_submission') return handleViewSubmission(payload)
  return undefined
}

// ─── block_actions — swap behavior placeholder when the value select changes ─

async function handleBlockActions(payload: any): Promise<undefined> {
  const action = payload?.actions?.[0]
  if (!action || action.action_id !== ACTION_VALUE) return
  const viewId = payload?.view?.id
  const viewHash = payload?.view?.hash
  if (!viewId) return

  const selectedValueId = action.selected_option?.value as string | undefined
  const client = getSlackClient()
  await client.views.update({
    view_id: viewId,
    hash: viewHash,
    view: buildNominationModal({ selectedValueId }),
  })
  return undefined
}

// ─── view_submission — create the nomination ─────────────────────────────────

async function handleViewSubmission(payload: any): Promise<ResponseAction | undefined> {
  if (payload?.view?.callback_id !== NOMINATION_CALLBACK_ID) return

  const state = payload.view.state?.values ?? {}
  const slackNomineeId: string | undefined =
    state[BLOCK_NOMINEE]?.[ACTION_NOMINEE]?.selected_user
  const valueId: string | undefined =
    state[BLOCK_VALUE]?.[ACTION_VALUE]?.selected_option?.value
  const behaviorText: string = state[BLOCK_BEHAVIOR]?.[ACTION_BEHAVIOR]?.value ?? ''
  const outcomeText: string = state[BLOCK_OUTCOME]?.[ACTION_OUTCOME]?.value ?? ''
  const evidenceLinks = [1, 2, 3]
    .map(
      (n) =>
        state[`${BLOCK_EVIDENCE_PREFIX}${n}`]?.[`${ACTION_EVIDENCE_PREFIX}${n}`]?.value as
          | string
          | undefined
    )
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

  const slackNominatorId: string | undefined = payload?.user?.id
  if (!slackNominatorId) {
    return modalError({
      [BLOCK_NOMINEE]:
        "Hmm — we couldn't identify you in Slack. Please try again or reach out to the People team.",
    })
  }

  const [nominator, nominee] = await Promise.all([
    resolveSlackUserToEmployee(slackNominatorId),
    slackNomineeId ? resolveSlackUserToEmployee(slackNomineeId) : Promise.resolve(null),
  ])

  if (!nominator) {
    return modalError({
      [BLOCK_NOMINEE]:
        "We couldn't find your record in our directory. Please reach out to the People team.",
    })
  }
  if (!slackNomineeId || !nominee) {
    return modalError({
      [BLOCK_NOMINEE]:
        "We couldn't find that teammate in our directory. Please pick someone else or reach out to the People team.",
    })
  }

  const result = await createNomination(
    {
      nominee_id: nominee.id,
      value_id: valueId ?? '',
      behavior_text: behaviorText,
      outcome_text: outcomeText,
      evidence_links: evidenceLinks,
    },
    nominator.id
  )

  if (!result.ok) return mapCreateErrorToModalError(result.error)

  // §9.1 confirmation DM. Warm, short. Rubina will do the copy pass pre-launch.
  const client = getSlackClient()
  const firstName = nominator.name.split(' ')[0]
  await client.chat.postMessage({
    channel: slackNominatorId,
    text: `Thank you, ${firstName}. Your nomination has been submitted. ${nominee.name} will be recognized if approved.`,
  })

  return { response_action: 'clear' }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function resolveSlackUserToEmployee(slackUserId: string): Promise<Employee | null> {
  const client = getSlackClient()
  const info = await client.users.info({ user: slackUserId })
  const email = info.user?.profile?.email
  if (!email) return null
  return getEmployeeByEmail(email)
}

function modalError(errors: Record<string, string>): ResponseAction {
  return { response_action: 'errors', errors }
}

function mapCreateErrorToModalError(
  error: { code: string; issues?: unknown[] }
): ResponseAction {
  switch (error.code) {
    case 'self_nomination':
      return modalError({
        [BLOCK_NOMINEE]:
          "You can't recognize yourself — pick a teammate who showed up for you.",
      })
    case 'nominee_not_found':
    case 'nominee_inactive':
      return modalError({
        [BLOCK_NOMINEE]:
          "That teammate isn't in our directory. Please pick someone else or reach out to the People team.",
      })
    case 'value_not_found':
      return modalError({
        [BLOCK_VALUE]: 'Please choose one of the four values.',
      })
    case 'validation':
      return modalError({
        [BLOCK_BEHAVIOR]: 'Something looks off with the text — check the length and try again.',
      })
    default:
      return modalError({
        [BLOCK_BEHAVIOR]: "We couldn't submit that. Please try again.",
      })
  }
}
