'use client'

import { useState } from 'react'
import { valueTagClasses } from '@/modules/values/constants'
import { KeepViewLink } from '@/components/layout/KeepViewLink'

// Three sortable tables shared across the participation drill-down.
// Each takes typed rows + click-to-sort behavior. Default sort is
// alphabetical by name for the geo and department tables — the
// participation page is a distribution view at leadership altitude,
// not a problem-hunt scorecard, so we no longer surface lowest-
// participation rows first. Users can still re-sort by any column
// from the header.
//
// Kept un-abstracted on purpose: each table has different columns
// and an extracted-generic version was harder to read than three
// small specific ones.

type Direction = 'asc' | 'desc'

interface SortState {
  key: string
  direction: Direction
}

function compare(
  a: number | string | null,
  b: number | string | null,
  direction: Direction
): number {
  if (a === null && b === null) return 0
  if (a === null) return direction === 'asc' ? -1 : 1
  if (b === null) return direction === 'asc' ? 1 : -1
  let cmp: number
  if (typeof a === 'number' && typeof b === 'number') {
    cmp = a - b
  } else {
    cmp = String(a).localeCompare(String(b))
  }
  return direction === 'asc' ? cmp : -cmp
}

function HeaderButton({
  label,
  align,
  active,
  direction,
  onClick,
}: {
  label: string
  align?: 'left' | 'right'
  active: boolean
  direction: Direction
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-[0.08em] ${
        active ? 'text-novo-ink' : 'text-novo-muted hover:text-novo-ink'
      } ${align === 'right' ? 'ml-auto' : ''}`}
    >
      {label}
      <span aria-hidden className="text-novo-muted">
        {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  )
}

// ─── Geo breakdown ──────────────────────────────────────────────────

export interface GeoTableRow {
  geo: string
  href: string
  active: number
  recogs: number
  given_pct: number
  received_pct: number
}

export function GeoBreakdownTable({ rows }: { rows: GeoTableRow[] }) {
  const [sort, setSort] = useState<SortState>({
    key: 'geo',
    direction: 'asc',
  })

  const sorted = [...rows].sort((a, b) => {
    switch (sort.key) {
      case 'geo':
        return compare(a.geo, b.geo, sort.direction)
      case 'active':
        return compare(a.active, b.active, sort.direction)
      case 'recogs':
        return compare(a.recogs, b.recogs, sort.direction)
      case 'received_pct':
        return compare(a.received_pct, b.received_pct, sort.direction)
      default:
        return compare(a.given_pct, b.given_pct, sort.direction)
    }
  })

  const head = (key: string, label: string, align: 'left' | 'right' = 'left') => (
    <HeaderButton
      label={label}
      align={align}
      active={sort.key === key}
      direction={sort.direction}
      onClick={() => toggleSort(setSort, sort, key)}
    />
  )

  return (
    <div className="overflow-hidden rounded-lg border border-novo-border bg-novo-elevated shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-novo-border bg-novo-surface/60 text-left">
            <th className="px-5 py-2.5">{head('geo', 'Geo')}</th>
            <th className="px-5 py-2.5 text-right">{head('active', 'Active', 'right')}</th>
            <th className="px-5 py-2.5 text-right">{head('recogs', 'Recogs', 'right')}</th>
            <th className="px-5 py-2.5 text-right">{head('given_pct', '% Gave', 'right')}</th>
            <th className="px-5 py-2.5 text-right">{head('received_pct', '% Received', 'right')}</th>
            <th className="px-5 py-2.5" aria-label="drill" />
          </tr>
        </thead>
        <tbody className="divide-y divide-novo-border">
          {sorted.map((row) => (
            <tr key={row.geo} className="group transition hover:bg-novo-hover/50">
              <td className="px-5 py-3">
                <KeepViewLink href={row.href} className="font-medium text-novo-ink group-hover:underline">
                  {row.geo}
                </KeepViewLink>
              </td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">{row.active}</td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">{row.recogs}</td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">{row.given_pct}%</td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">{row.received_pct}%</td>
              <td className="px-5 py-3 text-right text-novo-muted">→</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Department breakdown ───────────────────────────────────────────

// Department rows are non-clickable on this page. The drill-down to
// per-manager detail was retired — the participation page intentionally
// stops at department altitude. The /leadership/participation?manager=X
// route still exists if hit directly, but no UI links to it.
export interface DepartmentTableRow {
  department: string
  geo: string | null
  active: number
  recogs: number
  given_pct: number
  received_pct: number
}

export function DepartmentBreakdownTable({
  rows,
}: {
  rows: DepartmentTableRow[]
}) {
  const [sort, setSort] = useState<SortState>({
    key: 'department',
    direction: 'asc',
  })

  const sorted = [...rows].sort((a, b) => {
    switch (sort.key) {
      case 'department':
        return compare(a.department, b.department, sort.direction)
      case 'active':
        return compare(a.active, b.active, sort.direction)
      case 'recogs':
        return compare(a.recogs, b.recogs, sort.direction)
      case 'received_pct':
        return compare(a.received_pct, b.received_pct, sort.direction)
      default:
        return compare(a.given_pct, b.given_pct, sort.direction)
    }
  })

  const head = (key: string, label: string, align: 'left' | 'right' = 'left') => (
    <HeaderButton
      label={label}
      align={align}
      active={sort.key === key}
      direction={sort.direction}
      onClick={() => toggleSort(setSort, sort, key)}
    />
  )

  return (
    <div className="overflow-hidden rounded-lg border border-novo-border bg-novo-elevated shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-novo-border bg-novo-surface/60 text-left">
            <th className="px-5 py-2.5">{head('department', 'Department')}</th>
            <th className="px-5 py-2.5 text-right">{head('active', 'Active', 'right')}</th>
            <th className="px-5 py-2.5 text-right">{head('recogs', 'Recogs', 'right')}</th>
            <th className="px-5 py-2.5 text-right">{head('given_pct', '% Gave', 'right')}</th>
            <th className="px-5 py-2.5 text-right">{head('received_pct', '% Received', 'right')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-novo-border">
          {sorted.map((row) => (
            <tr key={row.department}>
              <td className="px-5 py-3">
                <span className="font-medium text-novo-ink">{row.department}</span>
                {row.geo && (
                  <span className="ml-2 text-2xs text-novo-muted tabular">
                    {row.geo}
                  </span>
                )}
              </td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">{row.active}</td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">{row.recogs}</td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">{row.given_pct}%</td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">{row.received_pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Managers in a department ───────────────────────────────────────

export interface ManagerTableRow {
  manager_id: string
  manager_name: string
  manager_role_title: string
  geo: string
  team_size: number
  href: string
  given_pct: number
  received_pct: number
  pool_remaining_pct: number | null
}

export function ManagerBreakdownTable({ rows }: { rows: ManagerTableRow[] }) {
  const [sort, setSort] = useState<SortState>({
    key: 'given_pct',
    direction: 'asc',
  })

  const sorted = [...rows].sort((a, b) => {
    switch (sort.key) {
      case 'manager_name':
        return compare(a.manager_name, b.manager_name, sort.direction)
      case 'team_size':
        return compare(a.team_size, b.team_size, sort.direction)
      case 'received_pct':
        return compare(a.received_pct, b.received_pct, sort.direction)
      case 'pool_remaining_pct':
        return compare(a.pool_remaining_pct, b.pool_remaining_pct, sort.direction)
      default:
        return compare(a.given_pct, b.given_pct, sort.direction)
    }
  })

  const head = (key: string, label: string, align: 'left' | 'right' = 'left') => (
    <HeaderButton
      label={label}
      align={align}
      active={sort.key === key}
      direction={sort.direction}
      onClick={() => toggleSort(setSort, sort, key)}
    />
  )

  return (
    <div className="overflow-hidden rounded-lg border border-novo-border bg-novo-elevated shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-novo-border bg-novo-surface/60 text-left">
            <th className="px-5 py-2.5">{head('manager_name', 'Manager')}</th>
            <th className="px-5 py-2.5 text-right">{head('team_size', 'Team', 'right')}</th>
            <th className="px-5 py-2.5 text-right">{head('given_pct', '% Gave', 'right')}</th>
            <th className="px-5 py-2.5 text-right">{head('received_pct', '% Received', 'right')}</th>
            <th className="px-5 py-2.5 text-right">{head('pool_remaining_pct', 'Pool remaining', 'right')}</th>
            <th className="px-5 py-2.5" aria-label="drill" />
          </tr>
        </thead>
        <tbody className="divide-y divide-novo-border">
          {sorted.map((row) => (
            <tr
              key={row.manager_id}
              className="group transition hover:bg-novo-hover/50"
            >
              <td className="px-5 py-3">
                <KeepViewLink href={row.href} className="block group-hover:underline">
                  <span className="font-medium text-novo-ink">{row.manager_name}</span>
                  <span className="block text-2xs text-novo-muted">
                    {row.manager_role_title} · {row.geo}
                  </span>
                </KeepViewLink>
              </td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">{row.team_size}</td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">{row.given_pct}%</td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">{row.received_pct}%</td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">
                {row.pool_remaining_pct === null ? '—' : `${row.pool_remaining_pct}%`}
              </td>
              <td className="px-5 py-3 text-right text-novo-muted">→</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Direct reports ────────────────────────────────────────────────

export interface ReportTableRow {
  employee_id: string
  employee_name: string
  role_title: string
  geo: string
  // ISO string so the row stays plain-serializable across the
  // server/client boundary.
  last_at: string | null
  last_value_id: string | null
  last_value_name: string | null
  last_nominator_name: string | null
  received_count: number
}

export function ReportTable({ rows }: { rows: ReportTableRow[] }) {
  // Default: never-recognized first (null sorts asc to the top), then
  // oldest-recognition first. Same intent as the dashboard sidebar's
  // TeamRhythm card.
  const [sort, setSort] = useState<SortState>({
    key: 'last_at',
    direction: 'asc',
  })

  const sorted = [...rows].sort((a, b) => {
    switch (sort.key) {
      case 'employee_name':
        return compare(a.employee_name, b.employee_name, sort.direction)
      case 'received_count':
        return compare(a.received_count, b.received_count, sort.direction)
      default:
        return compare(a.last_at, b.last_at, sort.direction)
    }
  })

  const head = (key: string, label: string, align: 'left' | 'right' = 'left') => (
    <HeaderButton
      label={label}
      align={align}
      active={sort.key === key}
      direction={sort.direction}
      onClick={() => toggleSort(setSort, sort, key)}
    />
  )

  return (
    <div className="overflow-hidden rounded-lg border border-novo-border bg-novo-elevated shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-novo-border bg-novo-surface/60 text-left">
            <th className="px-5 py-2.5">{head('employee_name', 'Report')}</th>
            <th className="px-5 py-2.5">Last recognition</th>
            <th className="px-5 py-2.5 text-right">{head('last_at', 'When', 'right')}</th>
            <th className="px-5 py-2.5 text-right">{head('received_count', 'Total', 'right')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-novo-border">
          {sorted.map((row) => (
            <tr key={row.employee_id} className="hover:bg-novo-hover/30">
              <td className="px-5 py-3">
                <span className="block font-medium text-novo-ink">{row.employee_name}</span>
                <span className="block text-2xs text-novo-muted">
                  {row.role_title} · {row.geo}
                </span>
              </td>
              <td className="px-5 py-3">
                {row.last_at && row.last_value_name ? (
                  <>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ${valueTagClasses(row.last_value_id ?? '')}`}
                    >
                      {row.last_value_name}
                    </span>
                    {row.last_nominator_name && (
                      <span className="ml-2 text-xs text-novo-subtle">
                        from {row.last_nominator_name}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-900">
                    Never recognized
                  </span>
                )}
              </td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">
                {row.last_at ? formatRelative(row.last_at) : '—'}
              </td>
              <td className="px-5 py-3 text-right text-novo-subtle tabular">
                {row.received_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatRelative(iso: string): string {
  const at = new Date(iso)
  const days = Math.max(
    0,
    Math.floor((Date.now() - at.getTime()) / (24 * 60 * 60 * 1000))
  )
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  return `${days}d ago`
}

function toggleSort(
  setSort: (s: SortState) => void,
  current: SortState,
  key: string
): void {
  if (current.key === key) {
    setSort({ key, direction: current.direction === 'asc' ? 'desc' : 'asc' })
  } else {
    setSort({ key, direction: 'asc' })
  }
}
