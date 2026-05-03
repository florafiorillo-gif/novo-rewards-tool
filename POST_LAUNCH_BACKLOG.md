# Post-launch backlog

Items deliberately deferred to **after** initial launch — not blocking, but
known gaps the next engineer or the People team should pick up when they
have capacity. New entries go here, not in `TODO.md` (which is the
pre-launch deferred-work doc — different bar, different urgency).

Each entry follows the same shape: what's missing, why it matters, where
the half-built code lives, rough size estimate.

---

## SLA nudge + escalation DMs

**Status:** Half-built. The data plumbing fires correctly; the DM that
would notify the approver is missing.

### What's missing

The 72-hour **nudge** and 7-day **escalation** thresholds in the SLA
sweep update database flags (`last_nudge_at`, `last_escalation_at`) and,
for escalation, write an `escalate` row to `ApprovalAction` — but they
never send a Slack DM to the approver. The approver only finds out their
nomination is overdue if they happen to check the web dashboard.

The 21-day auto-deny path is fully built and DOES DM the nominator
(`sendNominatorDenialDM` in [modules/approvals/sla.ts:88-93](modules/approvals/sla.ts#L88-L93)) —
that's the pattern to mirror for the two missing paths.

### Why it matters

- **Approver UX.** Recognitions sitting unattended is the most common
  failure mode for any approval workflow. Without a nudge, the approver's
  only feedback loop is "I happened to log into the dashboard today."
- **Spec compliance.** Spec §7.6 calls for nudge → escalate → auto-deny
  as a coherent series. Today the series is mute in the middle.
- **Avoidable auto-denies.** A nominator's 21-day auto-deny often means
  the approver simply didn't see the request. A 72-hour nudge would
  catch most of those before they hit the auto-deny.

Severity: medium. Not a launch blocker because the auto-deny path
prevents stuck nominations from accumulating indefinitely. But it makes
the system feel quietly broken to anyone whose nomination times out
without a nudge first.

### Where the half-built code lives

- **The sweep:** [modules/approvals/sla.ts](modules/approvals/sla.ts)
  - Nudge branch: [`sla.ts:56-60`](modules/approvals/sla.ts#L56-L60) —
    today writes `last_nudge_at` and adds the id to `out.nudged`. Add a
    DM call here.
  - Escalation branch: [`sla.ts:42-55`](modules/approvals/sla.ts#L42-L55) —
    today writes `last_escalation_at` and the `escalate` ApprovalAction.
    Add a DM call here.
- **Pattern to mirror:** the auto-deny path at [`sla.ts:66-95`](modules/approvals/sla.ts#L66-L95)
  loads the nominator + nominee via `getEmployeeById` and calls
  `sendNominatorDenialDM` from
  [modules/integrations/slack/notifications.ts](modules/integrations/slack/notifications.ts).
  The nudge + escalation DMs would target the **approver**, not the
  nominator (look up `nom.current_approver_id`).
- **Cron entry:** [app/api/cron/sla/route.ts](app/api/cron/sla/route.ts)
  — already wired to a Vercel Cron schedule, no change needed there.
- **Slack helpers:** new functions belong in
  [modules/integrations/slack/notifications.ts](modules/integrations/slack/notifications.ts).
  Suggested names: `sendApproverNudgeDM`, `sendApproverEscalationDM`.
  They should follow the existing soft-disable contract: call
  `getSlackClient()`, return early on null. The pattern is already
  established in `sendApproverDM` at [`notifications.ts:34-67`](modules/integrations/slack/notifications.ts#L34-L67).

### Rough size estimate

**½ – 1 day** for one engineer. Breakdown:
- Two new helpers in `notifications.ts` (~20 lines each, mostly
  block/copy boilerplate following the established pattern).
- Two new copy strings in [`copy.ts`](modules/integrations/slack/copy.ts) — Rubina may want to weigh in on tone.
- Two call additions in `sla.ts`, each three lines.
- A couple of test cases — mock the sender, assert it was called for
  nudged/escalated nominations and not for the auto-deny path (which
  already DMs the nominator, not the approver).

Bigger product question to confirm before building: does escalation
mean "DM the approver again with more urgency" or "DM the approver's
manager / a department head"? The current code only updates
`last_escalation_at` on the nomination — it doesn't reroute. If the
intent is to escalate to a different person, that's a larger change in
`runSlaSweep` (re-resolve `current_approver_id`) plus a recipient
decision in product. Worth a 15-min conversation with Sakshi before
opening the PR.
