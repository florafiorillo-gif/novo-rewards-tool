'use client'

import { useState } from 'react'
import { decideCommitteeAction } from '@/app/leadership/queue/actions'

interface ScopeNote {
  id: string
  template_text: string
}

interface Props {
  nominationId: string
  tier3Range: { min: number; max: number }
  scopeNotes: ScopeNote[]
}

// Spec §7.5 — decision form with reward fields inline. Reward block
// appears only when the viewer picks "Approve"; deny/defer stay lean.
export function CommitteeDecisionForm({
  nominationId,
  tier3Range,
  scopeNotes,
}: Props) {
  const [decision, setDecision] = useState<'' | 'approve' | 'deny' | 'defer'>('')
  const [rewardForm, setRewardForm] = useState<string>('')
  const [amount, setAmount] = useState<number>(tier3Range.min)
  const [deliveryPlan, setDeliveryPlan] = useState<string>('')
  const [scopeTemplateId, setScopeTemplateId] = useState<string>('')
  const [scopeText, setScopeText] = useState<string>('')

  return (
    <form action={decideCommitteeAction} className="space-y-4">
      <input type="hidden" name="nomination_id" value={nominationId} />

      <div className="flex gap-4 text-sm">
        {(['approve', 'deny', 'defer'] as const).map((d) => (
          <label key={d} className="flex items-center gap-1">
            <input
              type="radio"
              name="decision"
              value={d}
              checked={decision === d}
              onChange={() => setDecision(d)}
              required
            />
            {d === 'approve'
              ? 'Approve'
              : d === 'deny'
              ? 'Deny (returns to Tier 2)'
              : 'Defer'}
          </label>
        ))}
      </div>

      <textarea
        name="decision_log_text"
        required
        minLength={10}
        rows={2}
        placeholder="Short decision log — what did you decide and why?"
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
      />

      {decision === 'approve' && (
        <fieldset className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
          <legend className="px-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Reward · required when approving
          </legend>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-gray-900">Form</span>
              <select
                name="reward_form"
                value={rewardForm}
                onChange={(e) => setRewardForm(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Choose</option>
                <option value="cash">Cash</option>
                <option value="gift_card">Gift card</option>
                <option value="experience">Experience</option>
                <option value="l_and_d">L&D credit</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-900">
                Amount (USD) · ${tier3Range.min.toLocaleString()}–$
                {tier3Range.max.toLocaleString()}
              </span>
              <input
                type="number"
                name="reward_amount_usd"
                min={tier3Range.min}
                max={tier3Range.max}
                step={100}
                value={amount}
                onChange={(e) => setAmount(Number.parseFloat(e.target.value) || 0)}
                required
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-gray-900">Delivery plan</span>
            <textarea
              name="delivery_plan"
              rows={2}
              required
              placeholder="Who delivers, when, and how? (Personal delivery per spec §7.5.)"
              value={deliveryPlan}
              onChange={(e) => setDeliveryPlan(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="text-gray-900">Scope note</span>
            <select
              name="scope_note_template_id"
              value={scopeTemplateId}
              onChange={(e) => {
                setScopeTemplateId(e.target.value)
                const chosen = scopeNotes.find((t) => t.id === e.target.value)
                if (chosen) setScopeText(chosen.template_text)
              }}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Start with a template…</option>
              {scopeNotes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.template_text.slice(0, 80)}
                  {t.template_text.length > 80 ? '…' : ''}
                </option>
              ))}
            </select>
            <textarea
              name="scope_note_text"
              rows={2}
              required
              value={scopeText}
              onChange={(e) => setScopeText(e.target.value)}
              placeholder="Edit the template or write your own."
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>
        </fieldset>
      )}

      <button
        type="submit"
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Record decision
      </button>
    </form>
  )
}
