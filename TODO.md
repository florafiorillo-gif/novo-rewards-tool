# TODO — deferred follow-ups

Tracked from the Phase 3 audit and Phase 4 build. Items were consciously
deferred by the builder; none block the current phase. Work through before
launch review.

## Pre-Phase-5 must-wire

### Reward-selection lapse check against closed periods
**Ref:** Phase 4 Q4 / close-grace edge case. `BudgetPeriod.closed_at`
stamps when committee closes a period. Pools stay drawable for 14 days
(`CLOSE_GRACE_MS`) so in-flight approvals can still select rewards.
Phase 5 reward-selection must check at commit time: if the nomination
was approved in a period whose `closed_at + CLOSE_GRACE_MS < now`, fail
with a warm error ("period closed, please re-approve") and surface the
nomination back in the approver's queue. Don't silently lapse.

**Fix sketch:** resolve the period from nomination.approved_at →
BudgetPeriod lookup. If period.closed_at is set and the grace has
elapsed, refuse commitSpend and return a distinct error code like
`period_lapsed`. Phase 5 renders the warm message.

### Reward selection must call resolvePoolForNomination + commitSpend
**Ref:** Phase 4 decision Q4 + Q5. Phase 3 approvals don't touch the
budget. Phase 5 reward-selection does:
1. On screen load: resolvePoolForNomination → show pool.remaining.
2. On confirm: commitSpend(pool_id, reward_amount). On
   insufficient_balance, surface the warm "budget depleted since you
   started" error; offer the exception path (Checkbox → drawFromReserve).
3. On exception-checkbox confirm: drawFromReserve instead of commitSpend.

### Colombia cash bonus contractor path (spec §8.1)
Spec update: Colombia = fully manual, regardless of platform. Contractors
in Colombia may need a separate payment path from employees. Sakshi +
Finance to confirm. Phase 5 reward-selection should route all Colombia
recipients to the manual-fulfillment flow (set delivery_mechanism=manual)
and flag contractor vs employee for the People team's instruction.

## Pre-launch must-fix

### Tier 2 service should reject repeat approvals from the same actor
**Ref:** Audit I3.
Right now `isActorAuthorizedToApprove` at Tier 2 only checks membership in
the snapshot pair. The UI hides the Approve button after the viewer has
approved, but a double-click (or any programmatic caller) writes
duplicate `approve` ApprovalAction rows. `isTier2FullyApproved` uses a
`Set` so status stays correct; the audit trail doesn't.

**Fix sketch:** in `modules/approvals/shared.ts` extend
`isActorAuthorizedToApprove` with "and the actor hasn't already
approved at the current tier," returning `forbidden` on the second
click.

### `undoApproval` should reject tiers other than 1
**Ref:** Audit I4. Spec §13.3 is explicit: undo is Tier 1 only. The
service currently allows undo on any `approved` nomination within the
10-minute window. No UI path reaches Tier 2/3 undo today, but defense
in depth: add `if (nom.current_tier !== 1) return { ok: false, error: { code: 'forbidden' } }`
to `modules/approvals/undo.ts`.

### Tier 2 first-approver response returns the pre-update record
**Ref:** Audit I9.
`modules/approvals/approve.ts` returns `nomination: nom` on the first
Tier 2 approve — the load-time copy, so `updated_at` is stale. Harmless
today (no caller inspects it) but surprising. Re-read or patch before
returning.

### SLA auto-deny should notify the nominator
**Ref:** spec §7.6 ("Nominator notified"). Surfaced during the audit
but not in the initial scope. Auto-deny currently writes the deny row
and sets status but doesn't DM the nominator. Add a call to
`sendNominatorDenialDM` in `modules/approvals/sla.ts` `autoDeny`.

## Minor polish

### Structured `defer` value in `ApprovalActionType`
**Ref:** Audit M1. `decideCommittee` currently logs a `defer` decision
as `action: 'request_info'` in the audit mirror — semantically wrong.
Either add a `defer` value to the Prisma enum or stop mirroring defers
into ApprovalAction (the `CommitteeDecision` row already captures them).

### Drop the "Legacy" comment on `recordAction`
**Ref:** Audit M3. Already partially addressed in the I6/I7 split
(moved to `shared.ts` without the misleading comment), but worth one
more pass: the doc now references "committee + sla callers." Good,
but rename to e.g. `auditAction()` if we ever want to make the
difference between "state-changing service call" and "audit-only
write" more obvious.

### Replace raw `value_id` fallback on `/nominations/submitted`
**Ref:** Audit M4. `app/nominations/submitted/page.tsx` renders
`value.name ?? nomination.value_id` — if `getValueById` ever returns
null, the raw `val_run_for_the_bus` leaks to the user. Pin the four
values as exhaustive and drop the fallback, or show "—".

### `next build` fails on `/nominations/submitted` page-data collection
**Ref:** Surfaced during Phase 7A quality review. `USE_MOCK_DATA=true
npm run build` errors out with:

> A "use server" file can only export async functions, found object.
> Failed to collect page data for /nominations/submitted

Reproduces on `a73e737` (pre-7A), so it's pre-existing — not a Phase 7A
regression. `tsc --noEmit` and `next lint` both pass, which is why it
wasn't caught by prior phases. Unit tests don't touch the Next.js build
pipeline. Either the page file is re-exporting a non-function from a
`"use server"` module, or a server action is exported as a plain object.

**Fix sketch:** inspect `app/nominations/submitted/page.tsx` and any
`app/nominations/submitted/actions.ts` for non-async exports; narrow
the `"use server"` directive to the specific server actions. Tracks
until v1 launch — the app still runs under `next dev`.

### `/approvals/queue` ambiguity for unauthorized viewers
**Ref:** Audit A6. Empty state and "not an approver" state render the
same copy. Rubina's pre-launch copy pass should split them. Propose:
"Nothing waiting on you right now" vs. "You aren't an approver yet —
if you expect to see something here, check with the People team."

### Committee queue pagination
**Ref:** Audit A7. `app/committee/queue/page.tsx` loads the entire
queue in one render. Fine at monthly-batch cadence with ~10 items;
revisit before the Phase 7 dashboards.

### Tier 3 undo UI after 10 minutes
**Ref:** Audit A5. When the 10-minute window elapses, the Slack Undo
button stays visible but rejects on click with a warm ephemeral.
UX is acceptable but could chat.update the message to remove the
button entirely. Nice-to-have; schedule with Phase 6 when Slack
message state management comes up anyway.

## Open questions flagged to stakeholders

See `rewards_tool_spec.md` §19 for the authoritative running list.
Phase 3 audit additions:

- **A1** — document `system@novo.co` as the SLA auto-deny / escalate
  actor. Needs a line in the framework doc so managers reading the
  audit trail understand the "System" actor.
- **A3** — Rares + Sakshi: is it okay for the Tier 2 dept-head
  fallback to cross geos when the nominee's geo has no matching dept
  head? Mock data currently masks this; real Zoho data will surface
  it immediately.
