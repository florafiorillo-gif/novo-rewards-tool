'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import type { SubmitState } from '@/app/nominations/actions'
import { submitNominationAction } from '@/app/nominations/actions'

// The initial state lives here, not in actions.ts. Next requires every
// runtime export from a "use server" file to be an async function, so a
// plain object constant breaks `next build`.
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
}

interface Props {
  employees: EmployeeOption[]
  values: ValueOption[]
  // If the selected nominee's manager_id matches this, the reflection
  // dropdown appears and is required (spec §7.2 self-approval).
  currentEmployeeId: string
}

// Spec §7.2 — captured for pattern analysis; values must match the
// ReflectionType enum in prisma/schema.prisma.
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
    <form action={formAction} className="space-y-6">
      {state.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.formError}
        </p>
      )}

      <Field label="Who are you recognizing?" htmlFor="nominee_id" error={err.nominee_id}>
        <select
          id="nominee_id"
          name="nominee_id"
          required
          value={selectedNomineeId}
          onChange={(e) => setSelectedNomineeId(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-0"
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
      </Field>

      <Field label="Which value did they live?" htmlFor="value_id" error={err.value_id}>
        <select
          id="value_id"
          name="value_id"
          required
          value={selectedValueId}
          onChange={(e) => setSelectedValueId(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-0"
        >
          <option value="" disabled>
            Choose one
          </option>
          {values.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="What specifically did they do?"
        htmlFor="behavior_text"
        error={err.behavior_text}
        hint={`${behavior.length}/${MAX_LEN} · min ${MIN_LEN}`}
      >
        <textarea
          id="behavior_text"
          name="behavior_text"
          required
          minLength={MIN_LEN}
          maxLength={MAX_LEN}
          value={behavior}
          onChange={(e) => setBehavior(e.target.value)}
          placeholder={behaviorPlaceholder}
          rows={4}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-0"
        />
      </Field>

      <Field
        label="What was the outcome?"
        htmlFor="outcome_text"
        error={err.outcome_text}
        hint={`${outcome.length}/${MAX_LEN} · min ${MIN_LEN}`}
      >
        <textarea
          id="outcome_text"
          name="outcome_text"
          required
          minLength={MIN_LEN}
          maxLength={MAX_LEN}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder={OUTCOME_PLACEHOLDER}
          rows={3}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-0"
        />
      </Field>

      {isSelfApprovalPath && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
          <p className="mb-3 text-xs uppercase tracking-wide text-gray-500">
            You're recognizing one of your direct reports
          </p>
          <Field
            label="A quick reflection"
            htmlFor="reflection_type"
            error={err.reflection_type}
            hint="Captured for pattern analysis. Not shown publicly."
          >
            <select
              id="reflection_type"
              name="reflection_type"
              required={isSelfApprovalPath}
              defaultValue=""
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-0"
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
          </Field>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-900">
          Evidence links (optional)
        </legend>
        <p className="text-xs text-gray-500">Up to three — a PR, doc, or Slack thread.</p>
        {[1, 2, 3].map((n) => (
          <input
            key={n}
            type="url"
            name={`evidence_${n}`}
            placeholder="https://…"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-0"
          />
        ))}
        {err.evidence_links && (
          <p className="text-sm text-red-600">{err.evidence_links}</p>
        )}
      </fieldset>

      <SubmitButton />
    </form>
  )
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium text-gray-900">
          {label}
        </label>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-60"
    >
      {pending ? 'Submitting…' : 'Submit nomination'}
    </button>
  )
}
