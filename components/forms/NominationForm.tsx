'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import type { SubmitState } from '@/app/nominations/actions'
import { submitNominationAction } from '@/app/nominations/actions'
import { Button } from '@/components/ui/Button'

// Client form for /nominations/new. Same server action, same field names,
// same submit payload — only the visual treatment changes. Zod schema is
// untouched; all validation copy still flows through SubmitState.fieldErrors.

const INITIAL_STATE: SubmitState = { ok: false }

interface EmployeeOption {
  id: string
  name: string
  email: string
  role_title: string
  manager_id: string | null
}

interface ValueOption {
  id: string
  name: string
  behavior_placeholder: string
  description?: string
}

interface Props {
  employees: EmployeeOption[]
  values: ValueOption[]
  currentEmployeeId: string
}

const REFLECTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'FIRST_RECOGNITION', label: 'First recognition for this person' },
  {
    value: 'SPECIFIC_MOMENT',
    label: 'Specific moment, different from past recognitions',
  },
  {
    value: 'BROADER_PATTERN',
    label: 'Part of a broader pattern I want to acknowledge',
  },
  { value: 'OTHER', label: 'Other' },
]

const OUTCOME_PLACEHOLDER = 'What happened as a result? Why did it matter?'
const DEFAULT_BEHAVIOR_PLACEHOLDER = 'What did they do? Be specific.'
const MIN_LEN = 30
const MAX_LEN = 500

export function NominationForm({ employees, values, currentEmployeeId }: Props) {
  const [state, formAction] = useFormState(
    submitNominationAction,
    INITIAL_STATE
  )
  const [selectedNomineeId, setSelectedNomineeId] = useState('')
  const [selectedValueId, setSelectedValueId] = useState('')
  const [behavior, setBehavior] = useState('')
  const [outcome, setOutcome] = useState('')

  const selectedNominee = employees.find((e) => e.id === selectedNomineeId)
  const isSelfApprovalPath =
    !!selectedNominee && selectedNominee.manager_id === currentEmployeeId

  const behaviorPlaceholder =
    values.find((v) => v.id === selectedValueId)?.behavior_placeholder ??
    DEFAULT_BEHAVIOR_PLACEHOLDER

  const err = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-10">
      {state.formError && (
        <div className="rounded-md border border-novo-coral/30 bg-novo-pink-tint px-4 py-3 text-sm text-novo-oxblood">
          {state.formError}
        </div>
      )}

      {/* ── Nominee ────────────────────────────────────────────────── */}
      <section aria-labelledby="nominee-label" className="space-y-3">
        <FieldLabel
          id="nominee-label"
          title="Who are you recognizing?"
          step={1}
          total={3}
        />
        <select
          id="nominee_id"
          name="nominee_id"
          required
          value={selectedNomineeId}
          onChange={(e) => setSelectedNomineeId(e.target.value)}
          className="block h-11 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink transition focus:border-novo-ink"
        >
          <option value="" disabled>
            Pick a teammate
          </option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} — {e.role_title}
            </option>
          ))}
        </select>
        {err.nominee_id && <FieldError>{err.nominee_id}</FieldError>}
        {isSelfApprovalPath && (
          <p className="text-xs text-novo-subtle">
            This person reports to you — we&rsquo;ll collapse this into a single
            step so you can approve your own recognition inline.
          </p>
        )}
      </section>

      {/* ── Value cards ────────────────────────────────────────────── */}
      <section aria-labelledby="value-label" className="space-y-3">
        <FieldLabel
          id="value-label"
          title="Which value did they live?"
          step={2}
          total={3}
          hint="One per nomination. The one you&rsquo;d point to if asked."
        />
        <ValueCardGrid
          values={values}
          selectedId={selectedValueId}
          onSelect={setSelectedValueId}
        />
        {err.value_id && <FieldError>{err.value_id}</FieldError>}
      </section>

      {/* ── Narrative ──────────────────────────────────────────────── */}
      <section aria-labelledby="story-label" className="space-y-6">
        <FieldLabel
          id="story-label"
          title="Tell the story"
          step={3}
          total={3}
          hint="Specific beats general. A sentence or two is plenty."
        />

        <TextAreaField
          label="What specifically did they do?"
          id="behavior_text"
          name="behavior_text"
          placeholder={behaviorPlaceholder}
          required
          minLength={MIN_LEN}
          maxLength={MAX_LEN}
          value={behavior}
          onChange={setBehavior}
          error={err.behavior_text}
          rows={4}
        />

        <TextAreaField
          label="What was the outcome?"
          id="outcome_text"
          name="outcome_text"
          placeholder={OUTCOME_PLACEHOLDER}
          required
          minLength={MIN_LEN}
          maxLength={MAX_LEN}
          value={outcome}
          onChange={setOutcome}
          error={err.outcome_text}
          rows={3}
        />
      </section>

      {/* ── Self-approval reflection ───────────────────────────────── */}
      {isSelfApprovalPath && (
        <section className="space-y-3 rounded-lg border border-novo-border bg-novo-hover/40 p-5">
          <div>
            <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
              One quick reflection
            </p>
            <p className="mt-1 text-sm text-novo-ink">
              You&rsquo;re recognizing one of your directs. Help us see patterns
              in manager-to-direct recognition — this is not shown publicly.
            </p>
          </div>
          <select
            id="reflection_type"
            name="reflection_type"
            required={isSelfApprovalPath}
            defaultValue=""
            className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink focus:border-novo-ink"
          >
            <option value="" disabled>
              Pick one
            </option>
            {REFLECTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {err.reflection_type && <FieldError>{err.reflection_type}</FieldError>}
        </section>
      )}

      {/* ── Evidence (optional) ────────────────────────────────────── */}
      <section className="space-y-3">
        <FieldLabel
          id="evidence-label"
          title="Evidence links"
          optional
          hint="Up to three — a PR, doc, or Slack thread. Helps approvers act quickly."
        />
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <input
              key={n}
              type="url"
              name={`evidence_${n}`}
              placeholder="https://…"
              className="block h-10 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink placeholder:text-novo-muted focus:border-novo-ink"
            />
          ))}
        </div>
        {err.evidence_links && <FieldError>{err.evidence_links}</FieldError>}
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-novo-border pt-6">
        <p className="text-xs text-novo-subtle">
          Submissions route to an approver automatically. You can cancel within
          24 hours.
        </p>
        <SubmitButton />
      </div>
    </form>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function FieldLabel({
  id,
  title,
  hint,
  step,
  total,
  optional,
}: {
  id: string
  title: string
  hint?: string
  step?: number
  total?: number
  optional?: boolean
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        {step != null && total != null && (
          <span className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted tabular">
            {step}/{total}
          </span>
        )}
        <label id={id} className="text-sm font-semibold text-novo-ink">
          {title}
        </label>
        {optional && (
          <span className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
            Optional
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-novo-subtle">{hint}</p>}
    </div>
  )
}

function TextAreaField({
  label,
  id,
  name,
  placeholder,
  required,
  minLength,
  maxLength,
  value,
  onChange,
  error,
  rows,
}: {
  label: string
  id: string
  name: string
  placeholder: string
  required?: boolean
  minLength: number
  maxLength: number
  value: string
  onChange: (v: string) => void
  error?: string
  rows: number
}) {
  const len = value.length
  const belowMin = len > 0 && len < minLength
  const counterTone = belowMin ? 'text-novo-coral' : 'text-novo-muted'

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-novo-ink">
          {label}
        </label>
        <span className={`text-2xs tabular ${counterTone}`}>
          {len}/{maxLength}
          {belowMin && <span className="ml-1">· min {minLength}</span>}
        </span>
      </div>
      <textarea
        id={id}
        name={name}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="block w-full rounded-md border border-novo-border bg-novo-paper px-3 py-2.5 text-sm leading-6 text-novo-ink placeholder:text-novo-muted focus:border-novo-ink"
      />
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

function ValueCardGrid({
  values,
  selectedId,
  onSelect,
}: {
  values: ValueOption[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      {/* Hidden input so the server receives the selection under the expected
          form-field name without us having to build a custom submit path. */}
      <input type="hidden" name="value_id" value={selectedId} required />
      {values.map((v) => {
        const active = v.id === selectedId
        return (
          <label
            key={v.id}
            className={`flex cursor-pointer flex-col rounded-lg border p-4 transition ${
              active
                ? 'border-novo-ink bg-novo-ink text-novo-paper shadow-card'
                : 'border-novo-border bg-novo-paper text-novo-ink hover:border-novo-border-strong hover:bg-novo-hover/50'
            }`}
          >
            <input
              type="radio"
              name="value_id_radio"
              value={v.id}
              checked={active}
              onChange={() => onSelect(v.id)}
              className="sr-only"
            />
            <span
              className={`text-[15px] font-semibold ${
                active ? 'text-novo-paper' : 'text-novo-ink'
              }`}
            >
              {v.name}
            </span>
            <span
              className={`mt-1 text-xs leading-5 ${
                active ? 'text-white/70' : 'text-novo-subtle'
              }`}
            >
              {v.description ?? v.behavior_placeholder}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-novo-coral">{children}</p>
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} size="lg">
      {pending ? 'Submitting…' : 'Submit nomination'}
    </Button>
  )
}
