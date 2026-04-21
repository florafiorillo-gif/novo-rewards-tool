# Onboarding — Novo Rewards & Recognition Tool

Cold-start notes for Claude. Read this first when resuming work on this repo in a new session. Keep it terse; prefer updating existing sections over appending.

## 1. What this is

A Novo-specific recognition tool that operationalizes the Rewards & Recognition Framework. Slack-first, Next.js + Prisma, three-tier reward structure (Spot / Impact / Value Share) across US, India, Colombia. Not Bonusly — a values-observability instrument with role-scoped dollars, approval friction matched to stakes, and a single amplification channel.

**Authoritative spec:** `/Users/florafiorillo/Desktop/MD/rewards_tool_spec.md` (§1–§20). Treat §2 (Core Design Principles) as governing — any feature violating a principle is wrong.

## 2. Where we are

- **Last commit:** 02faf2e Phase 7E — recipient personal view at `/dashboard/me`. Phase 7 is complete across all five role surfaces: manager (7A/7A.1 `5721c65` → dec5052), dept head (7B `5721c65`), People team at `/people-ops/dashboard` (7C `651cea7`), committee at `/committee/dashboard` (7D `b3f15f9`), and recipient at `/dashboard/me` (7E `adf293d`). Recipient view deliberately strips tier labels and dollar amounts server-side per spec §2 principles 1+2.
- **Phases 1–7 complete. Phase 8–10 still pending.**
- **Build state:** `npm run typecheck` clean. `npm test` green (252 tests / 35 suites). `npm run test:integration` registers 18 tests across 7 suites; skips cleanly without `DATABASE_URL`. `next build` has a pre-existing failure on `/nominations/submitted` tracked in TODO.md (not a Phase 7 regression). `npm run lint` is unconfigured (interactive prompt on first run; has never been wired).
- **Data source:** everything runs on mock data in `modules/employees/mock-data.ts` and in-memory `mock-store.ts` files. `USE_MOCK_DATA=true` is the dev default. Prisma schema is complete and integration tests exist for when a real DB is wired.

## 3. Phase status (from spec §18)

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundations: Google SSO, employee mock, Slack scaffold | done |
| 2 | Nomination flow: Slack modal, web fallback, validation, routing | done |
| 3 | Approvals: T1 one-click, T1 self-approval, T2 two-approver, T3 committee, SLA cron | done |
| 4 | Budget engine: pools, allocation, reserve, exceptions, pacing, period lifecycle | done |
| 5 | Rewards: catalog, reward selection, vendor stub, tax gross-up, CSV/Zoho exports, scope notes, recipient DM, People Ops manual queue, tests | done |
| 6 | Communication: visibility prefs, ack-before-post, #made-it-happen post, reactions/comments, TZ-aware recipient DM | done |
| 7 | Dashboards per role | done (7A manager, 7B dept head, 7C People team, 7D committee, 7E recipient) |
| 8 | Monthly digest | pending |
| 9 | Integrations & ops: Zoho live, Airbase export, edge-case polish, admin tools | pending |
| 10 | Pre-launch: copy pass, manager training, catalog seeding | pending |

## 4. Repo layout

```
app/                   Next.js app-router pages + API routes
  api/auth/            NextAuth v5 + Google SSO
  api/slack/{commands,events,interactivity}   Slack app surfaces
  api/cron/{sla,digest,zoho-sync,post-sweep,recipient-dm-sweep}   Scheduled jobs
  api/people-ops/exports/justworks-cash       CSV download endpoint
  approvals/{queue,[id],[id]/reward}          Approver web surfaces
  nominations/{new,submitted}                 Web fallback flow
  committee/{queue,budget,budget/new,budget/[id]}
  people-ops/{catalog,catalog/new,catalog/[id],fulfillment,scope-notes}
  dashboard, settings

modules/               Service layer, one folder per bounded context
  nominations/         create, cancel, schema (30–500 char validation), routing
  approvals/           approve, deny, upgrade, undo, sla, request-info + service facade
  budget/              allocation, pools, routing (peer = nominee-geo), periods (draft→approved→active→closed + 14d grace), pacing, exceptions
  catalog/             per-geo items, tier/reward_type filters, mutability
  rewards/             selectReward, confirmReward (T2 two-step), markIssued/Delivered/Failed state machine
  fulfillment/         routing (geo × reward_type → mechanism), tax gross-up, exports (JustWorks CSV / Zoho instructions / Colombia manual), stub vendor adapter
  scope-notes/         per-tier template CRUD
  committee/           T3 batched review + decisions
  communication/       ack state machine, #made-it-happen post composer, reactions/comments, TZ-aware recipient DM scheduler
  dashboard/           per-role view assemblers: manager-view, department-view, people-team-view (+ exported buildProgramView), committee-view, recipient-view
  employees/           Zoho-shaped mock data; manager graph; getEmployeeById; setRecognitionPreference
  roles/               role resolution (manager / dept head / people team rep / committee)
  values/              four value IDs (constant set)

prisma/
  schema.prisma        Full v1 data model per spec §12
  seed.ts              Q2 2026 seed w/ values, mock employees, scope note templates

tests/
  unit/                Jest, mock-only, 153 tests across 25 suites
  integration/         Prisma suites; skip unless DATABASE_URL set + USE_MOCK_DATA=false

lib/                   db.ts (Prisma client), Slack helpers, time, auth helpers
auth.ts                NextAuth config
middleware.ts          Route-level auth gating
TODO.md                Deferred follow-ups from Phase 3 audit + Phase 4/5 build
```

## 5. Commands

```bash
npm run dev              # Next dev server (mock mode by default)
npm run typecheck        # tsc --noEmit
npm test                 # unit jest (fast, mock-only)
npm run test:integration # Prisma E2E; needs DATABASE_URL + USE_MOCK_DATA=false
npm run build            # next build

npm run prisma:generate
npm run prisma:migrate
npm run db:seed          # tsx prisma/seed.ts
```

## 6. Design principles — do not violate (spec §2)

1. **Tier is internal plumbing** — never shown to nominators/recipients/public.
2. **Dollars are role-scoped** — nominators/recipients never see amounts; approvers see only their own pool at decision time.
3. **Warm tone, few words** — all user-facing strings are placeholders; Rubina owns the final copy pass.
4. **Every surface invites reaction** — no dead-end broadcasts.
5. **Zero caps, pattern visibility** — no per-user nomination limits in v1.
6. **Single source of truth for values** — four values, no free text.
7. **Approval friction matches stakes** — T1 one-click, T2 two approvers + reasoning, T3 committee batched.
8. **Budget governs, doesn't block** — reserve absorbs exceptions with logging.
9. **Recipient comfort is primary** — acknowledge-before-post; opt-out of public.
10. **Copy is a first-class surface** — warm-tone placeholders today, final pass pre-launch.

## 7. Active invariants to preserve

- **Peer nominations draw from nominee's geo pool** (spec §10.2). Reversible in v2 if Finance prefers nominator-geo.
- **Colombia fulfillment is always manual** (spec §8.1) — `delivery_mechanism='manual'`, regardless of reward type. Contractor vs employee path differs in the People Ops instruction text.
- **Close-grace window is 14 days** (`CLOSE_GRACE_MS`) after `BudgetPeriod.closed_at`. Reward selection in a lapsed period returns `period_lapsed`.
- **T2 reward flow is two-step:** dept head picks (`selected_pending_confirm`), People Team rep confirms (`selected`). Dept head cannot confirm their own pick.
- **Undo is Tier 1 only, 10-minute window.** (TODO.md flags that the service should reject T2/T3 in defense-in-depth — not yet implemented.)
- **SLA auto-deny uses synthetic `system@novo.co` employee** as `actor_id` on ApprovalAction rows. Needs a line in the framework doc (tracked in spec §19 item 9 / TODO.md A1).
- **Nomination text validation:** `behavior_text` and `outcome_text` are `min(30).max(500)` chars after trim. Tests must seed strings ≥30 chars.
- **#made-it-happen post never fires twice** — `Nomination.post_fired_at` is set-once. Both the Slack ack button and the 24h sweep route through `markPostFired`, which is idempotent.
- **Recipient DM 24h fallback clock starts at `Reward.recipient_dm_scheduled_at`**; post-ack 24h clock starts at `Reward.recipient_dm_sent_at`. These are two separate timers.
- **team_only falls back to private in v1** — team channels aren't wired. `sendMadeItHappenPost` returns `skipped_team_only` and the public post is suppressed. Flip when team channels land.

## 8. Deferred items

See `TODO.md` for the running list. Headline items:

**Pre-launch must-fix:**
- Tier 2 service should reject repeat approvals from the same actor (Audit I3).
- `undoApproval` should reject tiers other than 1 (Audit I4, spec §13.3).
- Tier 2 first-approver response returns stale pre-update record (Audit I9).
- SLA auto-deny must DM the nominator (spec §7.6).

**Open questions flagged to stakeholders** (spec §17 + §19 items 9–11):
- System actor attribution doc note (Flora owns).
- Cross-geo dept-head fallback for T2 — acceptable, or People-team queue? (Rares + Sakshi.)
- `/approvals/queue` empty vs not-an-approver copy split (Rubina's copy pass).

## 9. What to work on next

Phase 7 is complete. Remaining pre-launch work:

**Phase 8 — Monthly digest.** Auto-drafted on the 1st; People team edits and publishes to `#made-it-happen` + email within 3 business days. Structure in spec §11.3. Probably lives under `modules/digest/` + `/people-ops/digest/*` (draft editor) and the existing `/api/cron/digest` endpoint (stub today) does the auto-draft.

**Phase 9 — Integrations & ops.** Zoho live sync (currently mock), Airbase export alongside JustWorks, hardening around SLA edge cases, admin tools for recategorising nominations. Spec §18 Phase 9.

**Phase 10 — Pre-launch.** Rubina copy pass across all user-facing strings (warm-tone placeholders today), manager training module, catalog seeding per geo.

**Parallel pre-launch must-fix** (TODO.md): Tier 2 repeat-approval guard (Audit I3), undoApproval tier guard (I4 / spec §13.3), Tier 2 first-approver stale response (I9), SLA auto-deny must DM the nominator (spec §7.6). Any of these is a good one-session chunk and doesn't depend on Phase 8/9/10 order.

## 10. Cold-start checklist for a new session

1. Read this file end-to-end.
2. `git log --oneline -10` — see what's landed since.
3. `git status` — see any uncommitted work from the prior session.
4. `cat TODO.md` — deferred items.
5. Skim `/Users/florafiorillo/Desktop/MD/rewards_tool_spec.md` §2 (principles) and §6–§11 (flows). The spec is the contract.
6. Run `npm run typecheck && npm test` to confirm the repo is green before making changes.
7. Ask the user what they want to tackle. Don't assume from the last session's "next" section — priorities may have shifted.

## 11. Session hygiene

- Never commit `.claude/` or `package-lock.json` without an explicit reason.
- Prefer `git add <specific-path>` over `git add -A` — repo has untracked files that aren't meant to be tracked.
- Commits follow the pattern `Phase NX: <one-line summary>` with a brief body. See `git log` for voice.
- Co-author line on commits: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- This doc is the running handoff — update it at the end of any substantive session.
