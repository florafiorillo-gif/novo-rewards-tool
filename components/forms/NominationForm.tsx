'use client'

import { useMemo, useState } from 'react'
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
  // Pre-select a nominee when the form is opened via a deep link such
  // as /nominations/new?nominee=emp_042. Silently ignored if the id
  // isn't in the employees list (e.g. the person became inactive
  // between the deep link being rendered and the form being opened).
  initialNomineeId?: string
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
const MAX_RECIPIENTS = 10

export function NominationForm({
  employees,
  values,
  currentEmployeeId,
  initialNomineeId,
}: Props) {
  const [state, formAction] = useFormState(
    submitNominationAction,
    INITIAL_STATE
  )
  const [selectedNomineeIds, setSelectedNomineeIds] = useState<string[]>(
    initialNomineeId && employees.some((e) => e.id === initialNomineeId)
      ? [initialNomineeId]
      : []
  )
  const [selectedValueId, setSelectedValueId] = useState('')
  const [behavior, setBehavior] = useState('')
  const [outcome, setOutcome] = useState('')

  const employeesById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees]
  )

  const isGroup = selectedNomineeIds.length > 1
  // Self-approval reflection is only required on the single-
  // recipient path. The service rejects multi-recipient submissions
  // that include any direct report, so reflection is never asked
  // for in the group case.
  const onlyNomineeId = !isGroup ? selectedNomineeIds[0] ?? null : null
  const onlyNominee = onlyNomineeId
    ? employeesById.get(onlyNomineeId) ?? null
    : null
  const isSelfApprovalPath =
    !!onlyNominee && onlyNominee.manager_id === currentEmployeeId

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

      {/* ── Nominees ───────────────────────────────────────────────── */}
      <section aria-labelledby="nominee-label" className="space-y-3">
        <FieldLabel
          id="nominee-label"
          title="Who are you recognizing?"
          step={1}
          total={3}
          hint={`Pick one teammate, or up to ${MAX_RECIPIENTS} for a group recognition.`}
        />
        <NomineePicker
          employees={employees}
          currentEmployeeId={currentEmployeeId}
          selectedIds={selectedNomineeIds}
          onChange={setSelectedNomineeIds}
        />
        {err.nominee_id && <FieldError>{err.nominee_id}</FieldError>}

        {isGroup && (
          <p className="rounded-md border border-novo-border bg-novo-hover/40 px-3 py-2 text-xs text-novo-subtle">
            You&rsquo;re recognizing {selectedNomineeIds.length} people for this
            moment. Each one&rsquo;s manager will approve independently. If one
            denies, only that recipient drops off.
          </p>
        )}

        {isSelfApprovalPath && (
          <p className="text-xs text-novo-subtle">
            This person reports to you. We&rsquo;ll collapse this into a single
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

      {/* ── Self-approval reflection (single-recipient only) ───────── */}
      {isSelfApprovalPath && (
        <section className="space-y-3 rounded-lg border border-novo-border bg-novo-hover/40 p-5">
          <div>
            <p className="text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted">
              One quick reflection
            </p>
            <p className="mt-1 text-sm text-novo-ink">
              You&rsquo;re recognizing one of your directs. Help us see patterns
              in manager-to-direct recognition. Not shown publicly.
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
          hint="Up to three. A PR, doc, or Slack thread. Helps approvers act quickly."
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
        <SubmitButton disabled={selectedNomineeIds.length === 0} />
      </div>
    </form>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────

// Multi-select with autocomplete. Filters the active-employee list as
// the user types and renders selected names as removable chips. Each
// selection emits a hidden <input name="nominee_ids" value=...> so
// FormData.getAll('nominee_ids') yields the array on submit.
function NomineePicker({
  employees,
  currentEmployeeId,
  selectedIds,
  onChange,
}: {
  employees: EmployeeOption[]
  currentEmployeeId: string
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const employeesById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees]
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length === 0) return []
    return employees
      .filter(
        (e) =>
          e.id !== currentEmployeeId &&
          !selectedIds.includes(e.id) &&
          (e.name.toLowerCase().includes(q) ||
            e.role_title.toLowerCase().includes(q) ||
            e.email.toLowerCase().includes(q))
      )
      .slice(0, 8)
  }, [query, employees, selectedIds, currentEmployeeId])

  const atCap = selectedIds.length >= MAX_RECIPIENTS

  function add(id: string) {
    if (selectedIds.includes(id)) return
    if (atCap) return
    onChange([...selectedIds, id])
    setQuery('')
    setOpen(false)
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id))
  }

  return (
    <div>
      {/* Hidden inputs — FormData.getAll('nominee_ids') reads these on submit. */}
      {selectedIds.map((id) => (
        <input
          key={id}
          type="hidden"
          name="nominee_ids"
          value={id}
        />
      ))}

      {selectedIds.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {selectedIds.map((id) => {
            const emp = employeesById.get(id)
            return (
              <li key={id}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-novo-border bg-novo-paper py-1 pl-3 pr-1 text-xs text-novo-ink shadow-card">
                  {emp?.name ?? id}
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    aria-label={`Remove ${emp?.name ?? id}`}
                    className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-novo-muted hover:bg-novo-hover hover:text-novo-ink"
                  >
                    ×
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so click on a suggestion still registers.
            setTimeout(() => setOpen(false), 120)
          }}
          placeholder={
            atCap
              ? `Cap reached. ${MAX_RECIPIENTS} max`
              : selectedIds.length === 0
                ? 'Type a name to find a teammate'
                : 'Add another teammate'
          }
          disabled={atCap}
          className="block h-11 w-full rounded-md border border-novo-border bg-novo-paper px-3 text-sm text-novo-ink placeholder:text-novo-muted focus:border-novo-ink disabled:bg-novo-hover disabled:text-novo-muted"
        />
        {open && matches.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-novo-border bg-novo-elevated p-1 text-sm shadow-elevated">
            {matches.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => add(e.id)}
                  className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-novo-hover"
                >
                  <span className="font-medium text-novo-ink">{e.name}</span>
                  <span className="text-2xs text-novo-muted">
                    {e.role_title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-1.5 text-2xs text-novo-muted tabular">
        {selectedIds.length}/{MAX_RECIPIENTS} selected
      </p>
    </div>
  )
}

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

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={disabled || pending} size="lg">
      {pending ? 'Submitting…' : 'Submit nomination'}
    </Button>
  )
}
