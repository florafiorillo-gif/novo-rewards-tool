'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import {
  approveNomination,
  denyNomination,
  proposeUpgrade,
  requestMoreInfo,
} from '@/modules/approvals/service'
import type { DenialReason } from '@/modules/approvals/types'
import {
  pingCommitteeUrgent,
  sendApproverDM,
  sendNominatorApprovalDM,
  sendNominatorDenialDM,
} from '@/modules/integrations/slack/notifications'
import { getEmployeeById } from '@/modules/employees/service'
import { getCommitteeMembers } from '@/modules/roles/service'
import { getValueById } from '@/modules/values/constants'
import { getNominationById } from '@/modules/nominations/service'

const DENIAL_REASONS: readonly DenialReason[] = [
  'failed_loophole',
  'value_mismatch',
  'already_recognized',
  'insufficient_detail',
  'other',
] as const

function isDenialReason(v: string): v is DenialReason {
  return (DENIAL_REASONS as readonly string[]).includes(v)
}

async function requireActorId(): Promise<string> {
  const session = await auth()
  const id = session?.user?.employeeId
  if (!id) throw new Error('Not authenticated')
  return id
}

// ─── Approve ─────────────────────────────────────────────────────────────────

export async function approveFromQueueAction(formData: FormData): Promise<void> {
  const actorId = await requireActorId()
  const nominationId = (formData.get('nomination_id') ?? '').toString()
  if (!nominationId) return

  const result = await approveNomination({
    nomination_id: nominationId,
    actor_id: actorId,
  })
  if (!result.ok) {
    revalidatePath('/approvals/queue')
    return
  }

  if (result.became_final) {
    await fireNominatorApprovalDM(result.nomination.id, actorId)
  }
  revalidatePath('/approvals/queue')
}

async function fireNominatorApprovalDM(
  nominationId: string,
  actorId: string
): Promise<void> {
  const nom = await getNominationById(nominationId)
  if (!nom) return
  if (nom.nominator_id === actorId) return
  const [nominator, nominee] = await Promise.all([
    getEmployeeById(nom.nominator_id),
    getEmployeeById(nom.nominee_id),
  ])
  if (!nominator || !nominee) return
  const value = getValueById(nom.value_id)
  await sendNominatorApprovalDM({
    nomination: nom,
    nominator_name: nominator.name,
    nominator_email: nominator.email,
    nominee_name: nominee.name,
    value_name: value?.name ?? 'a Novo value',
  })
}

// ─── Deny ────────────────────────────────────────────────────────────────────

export async function denyFromQueueAction(formData: FormData): Promise<void> {
  const actorId = await requireActorId()
  const nominationId = (formData.get('nomination_id') ?? '').toString()
  const reasonRaw = (formData.get('reason_structured') ?? 'other').toString()
  const reasonText = (formData.get('reason_text') ?? '').toString()
  if (!nominationId) return

  const reason: DenialReason = isDenialReason(reasonRaw) ? reasonRaw : 'other'

  const result = await denyNomination({
    nomination_id: nominationId,
    actor_id: actorId,
    reason_structured: reason,
    reason_text: reasonText,
  })
  if (!result.ok) {
    revalidatePath('/approvals/queue')
    return
  }

  // Only fire the nominator denial DM on the terminal 'denied' outcome.
  // Tier 2 denials return to Tier 1; the manager will see it back in their
  // queue and nominator stays in the loop via that path.
  if (result.outcome === 'denied') {
    const [nominator, nominee, actor] = await Promise.all([
      getEmployeeById(result.nomination.nominator_id),
      getEmployeeById(result.nomination.nominee_id),
      getEmployeeById(actorId),
    ])
    if (nominator && nominee && actor && nominator.id !== actor.id) {
      await sendNominatorDenialDM({
        nominator_email: nominator.email,
        nominee_name: nominee.name,
        approver_name: actor.name,
        reason_text: reasonText,
      })
    }
  }

  revalidatePath('/approvals/queue')
}

// ─── Propose upgrade / escalate ──────────────────────────────────────────────

export async function upgradeFromQueueAction(formData: FormData): Promise<void> {
  const actorId = await requireActorId()
  const nominationId = (formData.get('nomination_id') ?? '').toString()
  const toTierStr = (formData.get('to_tier') ?? '').toString()
  const reasoning = (formData.get('reasoning') ?? '').toString()
  const urgent = formData.get('urgent') === 'on'
  const toTier = toTierStr === '2' ? 2 : toTierStr === '3' ? 3 : 0
  if (!nominationId || !toTier) return

  const result = await proposeUpgrade({
    nomination_id: nominationId,
    actor_id: actorId,
    to_tier: toTier as 2 | 3,
    reasoning,
    urgent: toTier === 3 ? urgent : false,
  })

  if (result.ok && toTier === 2) {
    const nom = await getNominationById(nominationId)
    if (nom?.tier2_dept_head_id) {
      await sendApproverDM({ ...nom, current_approver_id: nom.tier2_dept_head_id })
    }
    if (nom?.tier2_people_team_rep_id) {
      await sendApproverDM({ ...nom, current_approver_id: nom.tier2_people_team_rep_id })
    }
  }
  if (result.ok && toTier === 3 && urgent) {
    const nom = await getNominationById(nominationId)
    const nominee = nom ? await getEmployeeById(nom.nominee_id) : null
    const value = nom ? getValueById(nom.value_id) : null
    const committee = await getCommitteeMembers()
    if (nom && nominee) {
      await pingCommitteeUrgent({
        nomination_id: nom.id,
        nominee_name: nominee.name,
        value_name: value?.name ?? 'a Novo value',
        committee_emails: committee.map((m) => m.email),
      })
    }
  }
  revalidatePath('/approvals/queue')
}

// ─── Request more info ───────────────────────────────────────────────────────

export async function requestInfoFromQueueAction(formData: FormData): Promise<void> {
  const actorId = await requireActorId()
  const nominationId = (formData.get('nomination_id') ?? '').toString()
  const question = (formData.get('question') ?? '').toString()
  if (!nominationId) return
  await requestMoreInfo({
    nomination_id: nominationId,
    actor_id: actorId,
    question,
  })
  revalidatePath('/approvals/queue')
}
