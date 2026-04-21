'use client'

import { useMemo, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  selectRewardAction,
  selectRewardInitialState,
} from '@/app/approvals/[id]/reward/actions'
import type { Geo } from '@/modules/employees/types'

// Placeholder rates mirrored here so the client can show the net/cost
// live without a round-trip. Single source is modules/fulfillment/tax.ts —
// keep in sync when Finance delivers real rates.
const PLACEHOLDER_GROSS_UP_PCT: Record<Geo, number> = {
  US: 30,
  India: 35,
  Colombia: 30,
}

interface CatalogItem {
  id: string
  name: string
  description: string
  reward_type: string
  vendor: string | null
  amount_usd: number
}

interface ScopeNote {
  id: string
  template_text: string
}

interface Props {
  nominationId: string
  nomineeGeo: Geo
  tier: 1 | 2 | 3
  range: { min: number; max: number }
  catalog: CatalogItem[]
  scopeNotes: ScopeNote[]
  poolRemaining: number
}

export function RewardSelectionForm({
  nominationId,
  nomineeGeo,
  tier,
  range,
  catalog,
  scopeNotes,
  poolRemaining,
}: Props) {
  const [state, formAction] = useFormState(
    selectRewardAction,
    selectRewardInitialState
  )
  const [choiceKind, setChoiceKind] = useState<'catalog' | 'cash' | 'custom'>(
    'catalog'
  )
  const [catalogItemId, setCatalogItemId] = useState<string>('')
  const [cashAmount, setCashAmount] = useState<number>(range.min)
  const [customAmount, setCustomAmount] = useState<number>(range.min)
  const [scopeNoteText, setScopeNoteText] = useState<string>('')
  const [scopeNoteTemplateId, setScopeNoteTemplateId] = useState<string>('')
  const [budgetException, setBudgetException] = useState<boolean>(false)

  const selectedCatalogItem = useMemo(
    () => catalog.find((c) => c.id === catalogItemId),
    [catalog, catalogItemId]
  )

  const cashGrossUp = useMemo(() => {
    if (choiceKind !== 'cash') return null
    const rate = PLACEHOLDER_GROSS_UP_PCT[nomineeGeo]
    if (cashAmount <= 0) return null
    const cost = cashAmount / (1 - rate / 100)
    return {
      rate,
      net: Math.round(cashAmount * 100) / 100,
      cost: Math.round(cost * 100) / 100,
    }
  }, [choiceKind, nomineeGeo, cashAmount])

  const effectiveAmount =
    choiceKind === 'catalog'
      ? selectedCatalogItem?.amount_usd ?? 0
      : choiceKind === 'cash'
      ? cashGrossUp?.cost ?? 0
      : customAmount

  const wouldExceedPool = effectiveAmount > poolRemaining && !budgetException
  const canSubmit =
    (choiceKind !== 'catalog' || !!catalogItemId) &&
    effectiveAmount > 0 &&
    scopeNoteText.trim().length > 0

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="nomination_id" value={nominationId} />
      <input type="hidden" name="choice_kind" value={choiceKind} />

      {!state.ok && state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
        Tax gross-up rates are placeholders (
        {PLACEHOLDER_GROSS_UP_PCT[nomineeGeo]}% for {nomineeGeo}). Finance
        delivers real rates before launch.
      </p>

      {/* Choice picker */}
      <div className="flex gap-2">
        {(['catalog', 'cash', 'custom'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setChoiceKind(k)}
            className={
              'rounded-md px-3 py-1.5 text-sm ' +
              (choiceKind === k
                ? 'bg-gray-900 text-white'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50')
            }
          >
            {k === 'catalog' ? 'Catalog' : k === 'cash' ? 'Cash' : 'Custom'}
          </button>
        ))}
      </div>

      {/* Catalog choice */}
      {choiceKind === 'catalog' && (
        <div className="space-y-3">
          {catalog.length === 0 ? (
            <p className="text-sm text-gray-500">
              No catalog items available for this geo + tier. Use cash or
              custom, or ask People Ops to add options.
            </p>
          ) : (
            <>
              <input type="hidden" name="catalog_item_id" value={catalogItemId} />
              {catalog.map((item) => (
                <label
                  key={item.id}
                  className={
                    'flex cursor-pointer items-start gap-3 rounded-md border p-3 ' +
                    (catalogItemId === item.id
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:bg-gray-50')
                  }
                >
                  <input
                    type="radio"
                    name="_catalog_choice"
                    checked={catalogItemId === item.id}
                    onChange={() => setCatalogItemId(item.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {item.name} · ${item.amount_usd}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.reward_type}
                      {item.vendor ? ` · ${item.vendor}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-gray-600">{item.description}</p>
                  </div>
                </label>
              ))}
            </>
          )}
        </div>
      )}

      {/* Cash choice */}
      {choiceKind === 'cash' && (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-900">
              Net to recipient (USD) · ${range.min}–${range.max}
            </span>
            <input
              type="number"
              name="cash_amount_usd"
              min={range.min}
              max={range.max}
              step={25}
              value={cashAmount}
              onChange={(e) => setCashAmount(Number.parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2"
            />
          </label>
          {cashGrossUp && (
            <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
              Net to recipient: ${cashGrossUp.net.toLocaleString()} · Cost to
              program (with {cashGrossUp.rate}% gross-up): $
              {cashGrossUp.cost.toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Custom choice */}
      {choiceKind === 'custom' && (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-900">
              Amount (USD) · ${range.min}–${range.max}
            </span>
            <input
              type="number"
              name="custom_amount_usd"
              min={range.min}
              max={range.max}
              step={25}
              value={customAmount}
              onChange={(e) => setCustomAmount(Number.parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-900">Short description</span>
            <textarea
              name="custom_description"
              rows={2}
              placeholder="What should People Ops source?"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2"
            />
          </label>
          <p className="text-xs text-gray-500">
            Custom routes to People Ops for manual sourcing.
          </p>
        </div>
      )}

      {/* Scope note */}
      <div className="space-y-2">
        <label htmlFor="scope_note_template_id" className="block text-sm font-medium text-gray-900">
          Scope note
        </label>
        <select
          id="scope_note_template_id"
          name="scope_note_template_id"
          value={scopeNoteTemplateId}
          onChange={(e) => {
            setScopeNoteTemplateId(e.target.value)
            const chosen = scopeNotes.find((t) => t.id === e.target.value)
            if (chosen) setScopeNoteText(chosen.template_text)
          }}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
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
          required
          rows={3}
          value={scopeNoteText}
          onChange={(e) => setScopeNoteText(e.target.value)}
          placeholder="Edit the template or write your own. Shown on the channel post."
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      {/* Budget exception */}
      {wouldExceedPool && (
        <label className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <input
            type="checkbox"
            name="budget_exception"
            checked={budgetException}
            onChange={(e) => setBudgetException(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            This reward exceeds the remaining pool balance ($
            {poolRemaining.toLocaleString()}). Check to approve as a budget
            exception — the reward will draw from reserve.
          </span>
        </label>
      )}
      {!wouldExceedPool && budgetException && (
        <input type="hidden" name="budget_exception" value="on" />
      )}

      <SubmitButton disabled={!canSubmit} />
    </form>
  )
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-60"
    >
      {pending ? 'Confirming…' : 'Confirm reward'}
    </button>
  )
}
