'use client'

import { useMemo, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  submitPeerRecognitionAction,
  type PeerSubmitState,
} from '@/app/nominations/actions'
import { Button } from '@/components/ui/Button'

const INITIAL_STATE: PeerSubmitState = { ok: false }

// Peer-recognition entry form. Single recipient, no evidence, no
// reflection, no group flow. Posts directly via
// submitPeerRecognitionAction; the server enforces self-nomination,
// org-direction (no upward), and the rolling 7-day frequency cap.
//
// This is intentionally separate from NominationForm rather than a
// branch inside it: the tiered form has reflection, evidence, group
// fan-out, and self-approval handling that don't apply here, and
// merging them would muddle both surfaces.

interface EmployeeOption {
  id: string
  name: string
  email: string
  role_title: string
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
  initialNomineeId?: string
}

const MIN_LEN = 30
const MAX_LEN = 500
const OUTCOME_PLACEHOLDER = 'What happened as a result? Why did it matter?'
const DEFAULT_BEHAVIOR_PLACEHOLDER = 'What did they do? Be specific.'

export function PeerRecognitionForm({
  employees,
  values,
  initialNomineeId,
}: Props) {
  const [state, formAction] = useFormState(
    submitPeerRecognitionAction,
    INITIAL_STATE
  )
  const [selectedNomineeId, setSelectedNomineeId] = useState<string>(
    initialNomineeId && employees.some((e) => e.id === initialNomineeId)
      ? initialNomineeId
      : ''
  )
  const [selectedValueId, setSelectedValueId] = useState('')
  const [behavior, setBehavior] = useState('')
  const [outcome, setOutcome] = useState('')

  const employeesById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees]
  )
  const selectedNominee = selectedNomineeId
    ? employeesById.get(selectedNomineeId) ?? null
    : null

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
      <section aria-labelledby="peer-nominee-label" className="space-y-3">
        <FieldLabel
          id="peer-nominee-label"
          title="Who are you recognizing?"
          step={1}
          total={3}
          hint="Anyone on the team — except your manager or anyone above them in your chain."
        />
        <SingleNomineePicker
          employees={employees}
          selected={selectedNominee}
          onSelect={(id) => setSelectedNomineeId(id ?? '')}
        />
        {/* Hidden field carrying the resolved id to the server action. */}
        <input type="hidden" name="nominee_id" value={selectedNomineeId} />
        {err.nominee_id && <FieldError>{err.nominee_id}</FieldError>}
      </section>

      {/* ── Value cards ────────────────────────────────────────────── */}
      <section aria-labelledby="peer-value-label" className="space-y-3">
        <FieldLabel
          id="peer-value-label"
          title="Which value did they live?"
          step={2}
          total={3}
          hint="One per recognition. The one you'd point to if asked."
        />
        <ValueCardGrid
          values={values}
          selectedId={selectedValueId}
          onSelect={setSelectedValueId}
        />
        {err.value_id && <FieldError>{err.value_id}</FieldError>}
      </section>

      {/* ── Narrative ──────────────────────────────────────────────── */}
      <section aria-labelledby="peer-story-label" className="space-y-6">
        <FieldLabel
          id="peer-story-label"
          title="Tell the story"
          step={3}
          total={3}
          hint="Specific beats general. A sentence or two is plenty."
        />

        <TextAreaField
          label="What specifically did they do?"
          id="peer_behavior_text"
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
          id="peer_outcome_text"
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

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-novo-border pt-6">
        <p className="text-xs text-novo-subtle">
          Peer recognitions post immediately. No approval, no reward — just
          acknowledgment.
        </p>
        <SubmitButton disabled={!selectedNomineeId || !selectedValueId} />
      </div>
    </form>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function SingleNomineePicker({
  employees,
  selected,
  onSelect,
}: {
  employees: EmployeeOption[]
  selected: EmployeeOption | null
  onSelect: (id: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length === 0) return []
    return employees
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.role_title.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [query, employees])

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-novo-border bg-novo-paper px-3 py-2.5 shadow-card">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-novo-ink">
            {selected.name}
          </p>
          <p className="truncate text-2xs text-novo-muted">
            {selected.role_title}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-xs text-novo-subtle hover:text-novo-ink"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Type a name to find a teammate"
        className="block h-11 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink placeholder:text-novo-muted focus:border-novo-ink"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-novo-border bg-novo-elevated p-1 text-sm shadow-elevated">
          {matches.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  onSelect(e.id)
                  setQuery('')
                  setOpen(false)
                }}
                className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-novo-hover"
              >
                <span className="font-medium text-novo-ink">{e.name}</span>
                <span className="text-2xs text-novo-muted">{e.role_title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FieldLabel({
  id,
  title,
  hint,
  step,
  total,
}: {
  id: string
  title: string
  hint?: string
  step?: number
  total?: number
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

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={disabled || pending} size="lg">
      {pending ? 'Posting…' : 'Post recognition'}
    </Button>
  )
}
