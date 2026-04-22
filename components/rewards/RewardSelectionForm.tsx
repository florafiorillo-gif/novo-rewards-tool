'use client'

import { useMemo, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  selectRewardAction,
  selectRewardInitialState,
} from '@/app/approvals/[id]/reward/actions'
import type { Geo } from '@/modules/employees/types'
import { Button } from '@/components/ui/Button'

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
      ? (selectedCatalogItem?.amount_usd ?? 0)
      : choiceKind === 'cash'
        ? (cashGrossUp?.cost ?? 0)
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
        <p className="rounded-md border border-novo-coral/30 bg-novo-pink-tint px-4 py-3 text-sm text-novo-oxblood">
          {state.error}
        </p>
      )}

      <p className="rounded-md border border-novo-border bg-novo-hover px-3 py-2 text-xs text-novo-subtle">
        Tax gross-up rates are placeholders (
        <span className="tabular">{PLACEHOLDER_GROSS_UP_PCT[nomineeGeo]}%</span>{' '}
        for {nomineeGeo}). Finance delivers real rates before launch.
      </p>

      {/* Choice tabs */}
      <div
        role="tablist"
        className="inline-flex rounded-md border border-novo-border bg-novo-paper p-0.5"
      >
        {(['catalog', 'cash', 'custom'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={choiceKind === k}
            onClick={() => setChoiceKind(k)}
            className={
              'h-8 rounded px-3 text-xs font-medium transition ' +
              (choiceKind === k
                ? 'bg-novo-ink text-novo-paper'
                : 'text-novo-subtle hover:text-novo-ink')
            }
          >
            {k === 'catalog' ? 'Catalog' : k === 'cash' ? 'Cash' : 'Custom'}
          </button>
        ))}
      </div>

      {/* Catalog */}
      {choiceKind === 'catalog' && (
        <div className="space-y-2">
          {catalog.length === 0 ? (
            <p className="rounded-md border border-dashed border-novo-border px-4 py-6 text-center text-sm text-novo-subtle">
              No catalog items available for this geo + tier. Use cash or
              custom, or ask People Ops to add options.
            </p>
          ) : (
            <>
              <input
                type="hidden"
                name="catalog_item_id"
                value={catalogItemId}
              />
              {catalog.map((item) => (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                    catalogItemId === item.id
                      ? 'border-novo-ink bg-novo-hover/50'
                      : 'border-novo-border bg-novo-paper hover:border-novo-border-strong'
                  }`}
                >
                  <input
                    type="radio"
                    name="_catalog_choice"
                    checked={catalogItemId === item.id}
                    onChange={() => setCatalogItemId(item.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-novo-ink">
                        {item.name}
                      </p>
                      <p className="text-sm font-semibold text-novo-ink tabular">
                        ${item.amount_usd}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-novo-muted">
                      {item.reward_type}
                      {item.vendor ? ` · ${item.vendor}` : ''}
                    </p>
                    <p className="mt-1.5 text-xs text-novo-subtle">
                      {item.description}
                    </p>
                  </div>
                </label>
              ))}
            </>
          )}
        </div>
      )}

      {/* Cash */}
      {choiceKind === 'cash' && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-novo-ink">
              Net to recipient (USD)
            </span>
            <span className="ml-2 text-xs text-novo-muted tabular">
              ${range.min}–${range.max}
            </span>
            <input
              type="number"
              name="cash_amount_usd"
              min={range.min}
              max={range.max}
              step={25}
              value={cashAmount}
              onChange={(e) =>
                setCashAmount(Number.parseFloat(e.target.value) || 0)
              }
              className="mt-1 block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm tabular text-novo-ink focus:border-novo-ink"
            />
          </label>
          {cashGrossUp && (
            <div className="rounded-md border border-novo-border bg-novo-hover px-3 py-2 text-xs text-novo-subtle">
              Net to recipient:{' '}
              <span className="tabular text-novo-ink">
                ${cashGrossUp.net.toLocaleString()}
              </span>{' '}
              · Cost to program (with{' '}
              <span className="tabular">{cashGrossUp.rate}%</span> gross-up):{' '}
              <span className="tabular text-novo-ink">
                ${cashGrossUp.cost.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Custom */}
      {choiceKind === 'custom' && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-novo-ink">
              Amount (USD)
            </span>
            <span className="ml-2 text-xs text-novo-muted tabular">
              ${range.min}–${range.max}
            </span>
            <input
              type="number"
              name="custom_amount_usd"
              min={range.min}
              max={range.max}
              step={25}
              value={customAmount}
              onChange={(e) =>
                setCustomAmount(Number.parseFloat(e.target.value) || 0)
              }
              className="mt-1 block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm tabular text-novo-ink focus:border-novo-ink"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-novo-ink">
              Short description
            </span>
            <textarea
              name="custom_description"
              rows={2}
              placeholder="What should People Ops source?"
              className="mt-1 block w-full rounded-md border border-novo-border bg-novo-paper px-3 py-2 text-sm text-novo-ink placeholder:text-novo-muted focus:border-novo-ink"
            />
          </label>
          <p className="text-xs text-novo-muted">
            Custom routes to People Ops for manual sourcing.
          </p>
        </div>
      )}

      {/* Scope note */}
      <div className="space-y-2">
        <label
          htmlFor="scope_note_template_id"
          className="block text-sm font-medium text-novo-ink"
        >
          Scope note
        </label>
        <p className="text-xs text-novo-subtle">
          A line or two of context attached to the reward. Shown on the channel
          post.
        </p>
        <select
          id="scope_note_template_id"
          name="scope_note_template_id"
          value={scopeNoteTemplateId}
          onChange={(e) => {
            setScopeNoteTemplateId(e.target.value)
            const chosen = scopeNotes.find((t) => t.id === e.target.value)
            if (chosen) setScopeNoteText(chosen.template_text)
          }}
          className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink focus:border-novo-ink"
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
          placeholder="Edit the template or write your own."
          className="block w-full rounded-md border border-novo-border bg-novo-paper px-3 py-2 text-sm text-novo-ink placeholder:text-novo-muted focus:border-novo-ink"
        />
      </div>

      {wouldExceedPool && (
        <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <input
            type="checkbox"
            name="budget_exception"
            checked={budgetException}
            onChange={(e) => setBudgetException(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            This reward exceeds the remaining pool balance ($
            <span className="tabular">{poolRemaining.toLocaleString()}</span>).
            Check to approve as a budget exception — the reward will draw from
            reserve.
          </span>
        </label>
      )}
      {!wouldExceedPool && budgetException && (
        <input type="hidden" name="budget_exception" value="on" />
      )}

      <div className="flex items-center justify-between border-t border-novo-border pt-6">
        <p className="text-xs text-novo-subtle">
          Budget commits on save.{tier === 2 ? ' People team rep confirms.' : ''}
        </p>
        <SubmitButton disabled={!canSubmit} />
      </div>
    </form>
  )
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={disabled || pending} size="lg">
      {pending ? 'Confirming…' : 'Confirm reward'}
    </Button>
  )
}
