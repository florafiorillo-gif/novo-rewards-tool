'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { selectReward, markRewardIssued } from '@/modules/rewards/service'
import type { RewardType } from '@/modules/rewards/types'
import { getCatalogItem } from '@/modules/catalog/service'
import { isManualDelivery } from '@/modules/fulfillment/routing'
import { getVendorAdapter } from '@/modules/fulfillment/stubs'
import { getEmployeeById } from '@/modules/employees/service'
import { getNominationById } from '@/modules/nominations/service'

// Server action called by /approvals/[id]/reward. Handles catalog,
// custom, and cash choices via a single form — the UI posts form fields
// the action destructures back into SelectRewardInput.
export async function selectRewardAction(
  _prev: SelectRewardState,
  formData: FormData
): Promise<SelectRewardState> {
  const session = await auth()
  const actorId = session?.user?.employeeId
  if (!actorId) {
    return { ok: false, error: 'Please sign in again — your session expired.' }
  }

  const nominationId = (formData.get('nomination_id') ?? '').toString()
  const choiceKind = (formData.get('choice_kind') ?? '').toString()
  const scopeNoteTemplateId = (formData.get('scope_note_template_id') ?? '').toString()
  const scopeNoteText = (formData.get('scope_note_text') ?? '').toString()
  const budgetException = formData.get('budget_exception') === 'on'

  if (!nominationId) return { ok: false, error: 'Missing nomination id.' }

  // Tier 2 reward selection parks the reward in selected_pending_confirm
  // so the People team rep signs off before budget commits (spec §7.4).
  const nomination = await getNominationById(nominationId)
  const pendingConfirm = nomination?.current_tier === 2

  const input: Parameters<typeof selectReward>[0] = {
    nomination_id: nominationId,
    actor_id: actorId,
    catalog_item_id: null,
    custom: null,
    scope_note_template_id: scopeNoteTemplateId || null,
    scope_note_text: scopeNoteText,
    budget_exception: budgetException,
    pending_confirm: pendingConfirm,
  }

  if (choiceKind === 'catalog') {
    const catalogItemId = (formData.get('catalog_item_id') ?? '').toString()
    if (!catalogItemId) return { ok: false, error: 'Please pick a catalog item.' }
    input.catalog_item_id = catalogItemId
  } else if (choiceKind === 'cash') {
    const amountStr = (formData.get('cash_amount_usd') ?? '').toString()
    const amount = Number.parseFloat(amountStr)
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: 'Enter a valid cash amount.' }
    }
    input.custom = { reward_type: 'cash', amount_usd: amount }
  } else if (choiceKind === 'custom') {
    const amountStr = (formData.get('custom_amount_usd') ?? '').toString()
    const description = (formData.get('custom_description') ?? '').toString().trim()
    const amount = Number.parseFloat(amountStr)
    if (!Number.isFinite(amount) || amount <= 0 || !description) {
      return { ok: false, error: 'Enter an amount and a short description.' }
    }
    input.custom = {
      reward_type: 'custom',
      amount_usd: amount,
      description,
    }
  } else {
    return { ok: false, error: 'Pick one of: catalog item, cash, or custom.' }
  }

  const result = await selectReward(input)
  if (!result.ok) {
    return { ok: false, error: messageForSelectError(result.error) }
  }

  // Fire the vendor stub for automated paths. Manual paths (Colombia +
  // custom + cash) stay in `selected` so People Ops picks them up.
  // Tier 2 stays in pending_confirm until the rep signs off, so no vendor
  // call here either — that happens after confirmReward.
  if (
    !pendingConfirm &&
    !isManualDelivery(result.reward.delivery_mechanism)
  ) {
    await fireVendorStub(result.reward.id, result.reward.reward_type, actorId)
  }

  // ── Apply-to-all (group nominations) ───────────────────────────────
  // When the form's apply-to-siblings checkbox was on, the page
  // emitted a sibling_nomination_ids hidden input per eligible
  // sibling. Each sibling re-runs selectReward with the same scope
  // note and choice. Failures are logged but don't roll the focused
  // selection back — those siblings stay in 'approved' status with
  // no reward and surface again in the approver's /review queue.
  const applyToSiblings = formData.get('apply_to_siblings') === 'on'
  const siblingIds = formData
    .getAll('sibling_nomination_ids')
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)

  if (applyToSiblings && siblingIds.length > 0) {
    for (const siblingId of siblingIds) {
      // Fresh tier check per sibling — most groups will be all T1
      // but a per-sibling upgrade earlier in the flow could have
      // bumped one to T2 (which lives in pending_confirm until the
      // rep signs off, mirroring the focused nomination's logic).
      const siblingNom = await getNominationById(siblingId)
      if (!siblingNom) continue
      const siblingPendingConfirm = siblingNom.current_tier === 2

      const siblingInput: Parameters<typeof selectReward>[0] = {
        ...input,
        nomination_id: siblingId,
        pending_confirm: siblingPendingConfirm,
      }
      const r = await selectReward(siblingInput)
      if (!r.ok) {
        console.error(
          `[rewards] apply-to-all failed for sibling ${siblingId}:`,
          r.error.code
        )
        continue
      }
      if (
        !siblingPendingConfirm &&
        !isManualDelivery(r.reward.delivery_mechanism)
      ) {
        await fireVendorStub(r.reward.id, r.reward.reward_type, actorId)
      }
    }
  }

  revalidatePath('/review')
  redirect(`/review?recent=${result.reward.id}`)
}

async function fireVendorStub(
  rewardId: string,
  rewardType: RewardType,
  _actorId: string
): Promise<void> {
  const { getReward } = await import('@/modules/rewards/service')
  const reward = await getReward(rewardId)
  if (!reward) return
  const nom = await getNominationById(reward.nomination_id)
  if (!nom) return
  const nominee = await getEmployeeById(nom.nominee_id)
  if (!nominee) return

  const adapter = getVendorAdapter()
  const callArgs = {
    recipient_email: nominee.email,
    recipient_name: nominee.name,
    amount_usd: reward.amount_usd,
    geo: nominee.geo,
    reward_type: rewardType,
    vendor_hint: reward.vendor ?? undefined,
  }
  try {
    if (rewardType === 'gift_card') await adapter.issueGiftCard(callArgs)
    else if (rewardType === 'experience') await adapter.issueExperience(callArgs)
    else if (rewardType === 'cash') await adapter.issueCash(callArgs)
    else if (rewardType === 'l_and_d') await adapter.issueGiftCard(callArgs)
    const issued = await markRewardIssued({ reward_id: rewardId, vendor_reference_id: null })
    // Schedule recipient DM (presence-gated, 24h fallback — spec §9.4 + 6E).
    if (issued.ok) {
      const { onRewardIssued } = await import(
        '@/modules/communication/recipient-dm'
      )
      await onRewardIssued({ reward_id: issued.reward.id })
    }
  } catch (err) {
    console.error('[rewards] vendor stub call failed', err)
  }
}

export type SelectRewardState =
  | { ok: false; error: string }
  | { ok: true; rewardId: string }

export const selectRewardInitialState: SelectRewardState = {
  ok: false,
  error: '',
}

type SelectRewardErrorCode =
  | 'nomination_not_found'
  | 'nomination_wrong_status'
  | 'reward_already_selected'
  | 'no_active_period'
  | 'period_lapsed'
  | 'catalog_item_not_found'
  | 'catalog_geo_mismatch'
  | 'amount_out_of_range'
  | 'scope_note_required'
  | 'insufficient_balance'
  | 'invalid_amount'
  | 'forbidden'

function messageForSelectError(
  error:
    | { code: Exclude<SelectRewardErrorCode, 'amount_out_of_range' | 'insufficient_balance'> }
    | { code: 'amount_out_of_range'; min: number; max: number }
    | { code: 'insufficient_balance'; remaining: number }
): string {
  switch (error.code) {
    case 'nomination_not_found':
      return "We couldn't find that nomination."
    case 'nomination_wrong_status':
      return 'This nomination is no longer in an approved state.'
    case 'reward_already_selected':
      return 'A reward was already chosen for this nomination.'
    case 'no_active_period':
      return 'No active budget period — reach out to the committee.'
    case 'period_lapsed':
      return 'This recognition period closed before the reward could be committed. Please refresh to see the latest periods, or reach out to the People team if this nomination still needs a reward.'
    case 'catalog_item_not_found':
      return "That catalog item isn't available."
    case 'catalog_geo_mismatch':
      return "That catalog item isn't available for the recipient's geo."
    case 'amount_out_of_range':
      return `Amount must be between $${error.min} and $${error.max} for this tier.`
    case 'scope_note_required':
      return 'Add a short scope note before confirming.'
    case 'insufficient_balance':
      return `Budget depleted since you started. Pool has $${error.remaining} left — retry, or mark as a budget exception.`
    case 'invalid_amount':
      return 'Enter a valid amount.'
    case 'forbidden':
      return "You're not authorized to select a reward for this nomination."
    default:
      return "We couldn't record that reward. Please try again — if this keeps happening, reach out to the People team."
  }
}

// Called from the reward-selection page to confirm a pending cash bonus
// after a People Ops user marks the CSV as sent. Phase 5 doesn't use it
// yet; Commit E wires manual fulfillment into this path.
export async function markIssuedAfterManualAction(
  formData: FormData
): Promise<void> {
  const session = await auth()
  const actorId = session?.user?.employeeId
  if (!actorId) throw new Error('Not authenticated')
  const rewardId = (formData.get('reward_id') ?? '').toString()
  if (!rewardId) return
  await markRewardIssued({ reward_id: rewardId, vendor_reference_id: null })
  revalidatePath('/people-ops/fulfillment')
}
