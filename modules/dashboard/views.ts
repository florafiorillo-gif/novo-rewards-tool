import type { ResolvedRole } from '@/modules/roles/resolver'

// Four canonical dashboard views. Each view is a fixed set of widgets
// (see WIDGETS_BY_VIEW in app/dashboard/page.tsx). A single signed-in
// user can have several real views at once — e.g., cat@novo.co is
// Committee + People Ops + Manager + Employee.
//
// Rendering rules:
// 1. No simulation selected → render the union of the viewer's real
//    views (additive merge, matches legacy behavior).
// 2. Simulation selected (via ?view=X) → render only X's widget set,
//    regardless of the viewer's real roles.
//
// The "primary" / highest real view is used purely for the header
// badge label when no simulation is active, and as a sort key so the
// switcher lists the viewer's most relevant option first.
//
// Simulation is a VIEW-COMPOSITION tool only — it never affects
// permission checks. Server actions (approve Tier 2, decide Tier 3,
// edit catalog, confirm reward) continue to read session.employeeId
// and gate on the viewer's *real* role via modules/roles/service.
//
// DEMO-MODE NOTE: the view-switcher is intended for pre-launch demos
// and tester walkthroughs. Remove it (or gate it behind a feature
// flag / NODE_ENV !== 'production') before production launch so that
// non-admins can't simulate admin views in the live org.
export type DashboardView =
  | 'employee'
  | 'manager'
  | 'people_ops'
  | 'committee'

export const ALL_VIEWS: readonly DashboardView[] = [
  'committee',
  'people_ops',
  'manager',
  'employee',
] as const

// User-facing labels. Internal view id 'committee' still reflects
// the underlying role flag (is_committee_member); only the visible
// string has been relabeled to "Leadership" as part of the tester
// walkthrough feedback.
export const VIEW_LABELS: Record<DashboardView, string> = {
  employee: 'Employee',
  manager: 'Manager',
  people_ops: 'People Ops',
  committee: 'Leadership',
}

// Highest real view held by this viewer. Committee is the widest
// scope (program-level visibility + Tier 3 decisions), so it wins.
// Falls through to 'employee' which everyone holds.
export function highestRealView(role: ResolvedRole): DashboardView {
  if (role.is_committee) return 'committee'
  if (role.is_people_team) return 'people_ops'
  if (role.is_manager) return 'manager'
  return 'employee'
}

// The set of views the viewer *actually* holds. Always includes
// 'employee' — every viewer is at minimum an employee.
export function realViews(role: ResolvedRole): Set<DashboardView> {
  const s = new Set<DashboardView>(['employee'])
  if (role.is_manager) s.add('manager')
  if (role.is_people_team) s.add('people_ops')
  if (role.is_committee) s.add('committee')
  return s
}

// Which views should render on the dashboard right now. If the
// viewer has selected a simulated view, only that view renders;
// otherwise it's the additive merge of real views.
export function activeViews(
  role: ResolvedRole,
  simulated: DashboardView | null
): Set<DashboardView> {
  if (simulated) return new Set([simulated])
  return realViews(role)
}

// Narrow a raw query-param value to a valid DashboardView, or null
// if the param is missing or malformed. Callers should treat null as
// "no simulation active".
export function parseViewParam(raw: unknown): DashboardView | null {
  if (typeof raw !== 'string') return null
  if ((ALL_VIEWS as readonly string[]).includes(raw))
    return raw as DashboardView
  return null
}

// True when the viewer is currently simulating a view (any ?view=X
// that parsed as valid). Drives the "(simulated)" suffix on the
// header badge.
export function isSimulating(simulated: DashboardView | null): boolean {
  return simulated !== null
}

// ─── Role-aware navigation ──────────────────────────────────────────
// Shared items bracket the nav: "Home" at the start, "My recognitions"
// at the end, with the viewer's role-specific items sandwiched in
// between. This matches the tester brief's spelled-out per-role nav
// order (Manager: Home, Review, My team, My recognitions).
//
// Per-view additions render in a fixed outer order (manager →
// people_ops → committee) so a multi-role viewer sees a stable
// left-to-right sequence regardless of Set iteration.

export interface NavLinkItem {
  href: string
  label: string
}

export const NAV_ITEM_HOME: NavLinkItem = { href: '/dashboard', label: 'Home' }
export const NAV_ITEM_MY_RECOGNITIONS: NavLinkItem = {
  href: '/dashboard/me',
  label: 'My recognitions',
}

export const NAV_ITEMS_PER_VIEW: Record<DashboardView, readonly NavLinkItem[]> = {
  employee: [], // shared-only; included for completeness
  manager: [
    { href: '/review', label: 'Review' },
    { href: '/dashboard/team', label: 'My team' },
  ],
  people_ops: [
    { href: '/people-ops/dashboard', label: 'Program' },
    { href: '/people-ops', label: 'Admin' },
  ],
  committee: [{ href: '/leadership/dashboard', label: 'Leadership' }],
}

const VIEW_ORDER: readonly DashboardView[] = [
  'manager',
  'people_ops',
  'committee',
  'employee',
] as const

// Build the flattened nav list for the viewer's currently-active
// views. Home leads; My recognitions trails; role-specific items
// sit in the middle. Dedupes on href.
export function navItemsForActiveViews(
  views: Set<DashboardView>
): NavLinkItem[] {
  const seen = new Set<string>()
  const items: NavLinkItem[] = []
  const push = (item: NavLinkItem) => {
    if (seen.has(item.href)) return
    seen.add(item.href)
    items.push(item)
  }
  push(NAV_ITEM_HOME)
  for (const v of VIEW_ORDER) {
    if (!views.has(v)) continue
    for (const item of NAV_ITEMS_PER_VIEW[v]) push(item)
  }
  push(NAV_ITEM_MY_RECOGNITIONS)
  return items
}
