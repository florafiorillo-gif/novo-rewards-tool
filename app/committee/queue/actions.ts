'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import {
  decideCommittee,
  recuseCommitteeMember,
} from '@/modules/committee/service'
import { isCommitteeMember } from '@/modules/roles/service'
import {
  sendNominatorApprovalDM,
  sendNominatorDenialDM,
} from '@/modules/integrations/slack/notifications'
import { getEmployeeById } from '@/modules/employees/service'
import { getValueById } from '@/modules/values/constants'
import { getNominationById } from '@/modules/nominations/service'
import type { CommitteeDecisionType } from '@/modules/committee/types'

async function requireCommitteeActor(): Promise<string> {
  const session = await auth()
  const id = session?.user?.employeeId
  if (!id) throw new Error('Not authenticated')
  if (!(await isCommitteeMember(id))) throw new Error('Not authorized')
  return id
}

const DECISION_VALUES: readonly CommitteeDecisionType[] = [
  'approve',
  'deny',
  'defer',
] as const
function isDecision(v: string): v is CommitteeDecisionType {
  return (DECISION_VALUES as readonly string[]).includes(v)
}

const VALID_REWARD_FORMS = ['cash', 'gift_card', 'experience', 'l_and_d', 'custom'] as const

export async function decideCommitteeAction(formData: FormData): Promise<void> {
  const actorId = await requireCommitteeActor()
  const nominationId = (formData.get('nomination_id') ?? '').toString()
  const decisionRaw = (formData.get('decision') ?? '').toString()
  const decisionLog = (formData.get('decision_log_text') ?? '').toString()
  if (!nominationId || !isDecision(decisionRaw)) return

  // Spec §7.5 — committee picks reward + amount + delivery plan inline
  // as part of the approve decision. Deny/defer don't need these.
  const rewardFormRaw = (formData.get('reward_form') ?? '').toString()
  const rewardAmountStr = (formData.get('reward_amount_usd') ?? '').toString()
  const deliveryPlan = (formData.get('delivery_plan') ?? '').toString()
  const scopeNoteText = (formData.get('scope_note_text') ?? '').toString()
  const scopeNoteTemplateId = (formData.get('scope_note_template_id') ?? '').toString()

  let rewardPayload:
    | Parameters<typeof decideCommittee>[0]['reward']
    | undefined = undefined
  if (decisionRaw === 'approve') {
    const rewardForm = (VALID_REWARD_FORMS as readonly string[]).includes(rewardFormRaw)
      ? (rewardFormRaw as (typeof VALID_REWARD_FORMS)[number])
      : null
    const amount = Number.parseFloat(rewardAmountStr)
    if (!rewardForm || !Number.isFinite(amount) || amount <= 0) return
    rewardPayload = {
      reward_type: rewardForm,
      amount_usd: amount,
      delivery_plan: deliveryPlan,
      scope_note_text: scopeNoteText,
      scope_note_template_id: scopeNoteTemplateId || undefined,
    }
  }

  const result = await decideCommittee({
    nomination_id: nominationId,
    actor_id: actorId,
    decision: decisionRaw,
    decision_log_text: decisionLog,
    reward: rewardPayload,
  })

  // Fire nominator notifications on terminal outcomes only.
  if (result.ok && result.outcome === 'approved') {
    const nom = await getNominationById(nominationId)
    if (nom) {
      const [nominator, nominee] = await Promise.all([
        getEmployeeById(nom.nominator_id),
        getEmployeeById(nom.nominee_id),
      ])
      const value = getValueById(nom.value_id)
      if (nominator && nominee && nominator.id !== actorId) {
        await sendNominatorApprovalDM({
          nomination: nom,
          nominator_name: nominator.name,
          nominator_email: nominator.email,
          nominee_name: nominee.name,
          value_name: value?.name ?? 'a Novo value',
        })
      }
    }
  }

  // Tier 3 deny drops back to Tier 2 — no terminal DM; the Tier 2 approvers
  // get the nomination again and will close the loop with the nominator.

  revalidatePath('/committee/queue')
}

export async function recuseCommitteeAction(formData: FormData): Promise<void> {
  const actorId = await requireCommitteeActor()
  const nominationId = (formData.get('nomination_id') ?? '').toString()
  if (!nominationId) return
  await recuseCommitteeMember({ nomination_id: nominationId, actor_id: actorId })
  revalidatePath('/committee/queue')
}
