# Design decisions — deferred work

Running log of directional decisions that are not in scope for the current
phase but matter for future phases. Each note describes the intent, the
reason for deferring, and the trigger for revisiting. **None of these are
tickets — they become tickets when the trigger fires.**

For in-flight implementation TODOs see `TODO.md`. For phase-level scope
see `ONBOARDING.md` §3.

---

## Reward catalog: vendor-driven with curation

**Decision:** Manual catalog entry is the primary source today, but that
does not scale. When a real vendor integration lands (Tremendous or Tango
in Phase 9 — see spec §18), the catalog should auto-pull the platform's
gift-card / e-commerce inventory. People Ops curates via a show / hide
toggle per item rather than typing in SKUs by hand. Manual entry remains
for **custom rewards** only (one-off experiences, books, courses, anything
outside the vendor network).

**Why deferred:** The vendor choice between Tremendous and Tango is still
open (see ONBOARDING.md §8 "Deferred items" and spec §17). Building the
curation UI before the vendor ships means re-fitting it to whichever API
we end up with, which is wasted work.

**Trigger to revisit:** Phase 9 vendor-integration ticket opens. The
catalog service (`modules/catalog/service.ts`) and admin surface
(`/people-ops/catalog`) should be treated as the blast radius — vendor
sync will likely live under `modules/catalog/sync/<vendor>.ts` with the
existing CRUD repurposed for curation.

## Visibility preferences: first-signin prompt

**Decision:** The current Settings → Visibility preferences page is
correct (public / team-only / private, default public). Surface it as a
**one-time prompt the first time a new employee signs in** — "When
you're recognized, where should it post?" — instead of relying on
employees to discover the settings page later. Falls through to the
existing default if they dismiss without answering.

**Why deferred:** Not urgent. Default is sensible (public); the
downside is people staying on the default because they never found the
toggle. Worth doing but lower-priority than Phase 9 vendor integrations.

**Trigger to revisit:** Phase 10 pre-launch polish pass (spec §18).
Likely lives as a modal or inline banner in `components/layout/` that
reads a `recognition_preference_set_at` flag on the Employee row
(schema change required).

## Leadership program health: denser pool layout

**Decision:** The Program health page
(`/leadership/dashboard` → `GeoPoolsCard`) currently lists every
manager's individual pool as a tall vertical list. Correct for
governance visibility, but visually heavy at 25+ employees — the
page scrolls for multiple screens on a full US roster. Collapse each
geo group by default with an expand affordance, **or** switch the
per-geo list to a table with columns for manager / allocated / spent
/ pacing.

**Why deferred:** Low priority. Current layout isn't broken — testers
could read it — and a real-Zoho-sized roster (30–50 employees) is the
right moment to choose between "collapse" and "table" density. Pre-tuning
for mock-data sizes risks optimizing for the wrong shape.

**Trigger to revisit:** When `USE_MOCK_DATA=false` with a real directory
sync (Phase 9) or when the first People Ops rep reports that the page is
hard to scan.

---

## Edge cases worth watching (not decisions yet)

- **Dept head without direct reports.** The nav's "Review" link is
  gated by `is_manager` (has direct reports). A dept head with
  `is_department_head=true` but zero direct reports would still have
  Tier 2 items in `/review` but no nav entry pointing there — they'd
  need to bookmark. In the current seed data every dept head also has
  reports so this is theoretical, but worth flagging if the real org
  chart exposes a case.
