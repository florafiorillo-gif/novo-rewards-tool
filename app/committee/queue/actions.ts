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

export async function decideCommitteeAction(formData: FormData): Promise<void> {
  const actorId = await requireCommitteeActor()
  const nominationId = (formData.get('nomination_id') ?? '').toString()
  const decisionRaw = (formData.get('decision') ?? '').toString()
  const decisionLog = (formData.get('decision_log_text') ?? '').toString()
  if (!nominationId || !isDecision(decisionRaw)) return

  const result = await decideCommittee({
    nomination_id: nominationId,
    actor_id: actorId,
    decision: decisionRaw,
    decision_log_text: decisionLog,
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
