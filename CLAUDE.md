# CLAUDE.md

General behavioral guidelines live in @.claude/WRITING_GUIDELINES.md — read those first (think-before-coding, simplicity, surgical changes, goal-driven execution, ticket-ID handling, and the non-technical-user communication rule). This file layers **project-specific** conventions on top; it does not repeat what's already in the guidelines.

Working notes for Claude Code agents operating on this repo. These are conventions that have been locked in through actual work on the codebase, not a template. If something here conflicts with what you see in the code, the code wins — update this file.

This repo is the **Novo Rewards** tool: an internal employee-recognition + reward-fulfillment app. Next.js 14 App Router, TypeScript, Tailwind, Prisma, NextAuth v5, optional Slack. Currently runs in dev with `USE_MOCK_DATA=true` by default — the service layer has a mock + Prisma path for every reader and writer.

---

## Project-specific behavioral rules

These extend (don't replace) @.claude/WRITING_GUIDELINES.md.

### 1. Goal-driven execution in this repo

Define success criteria. Verify. Then declare done.

Transform tasks into verifiable goals:
- "Add validation" → "Show invalid input is rejected end-to-end (curl/tsx script), then confirm valid input still passes."
- "Fix the bug" → "Reproduce first. Fix. Re-run the repro. Confirm side-streams (typecheck, key flows) still work."
- "Refactor X" → "Confirm the typecheck + the affected routes render 200 before and after."

No test suite lives in this repo right now ([see History](#history) below). Verification falls to typecheck + targeted curl/tsx smokes against the running dev server.

### 2. Scope boundaries the user has set

These have come up multiple times. Respect them by default:

- **"Visual / UX only" passes don't touch logic, routes, or data flow.** You can compose new *view* helpers in `modules/dashboard/` (mirroring `manager-view.ts`, `department-view.ts`) — that's assembly, not new service surface. You cannot add new domain services, new Zod schemas, or new form fields in a UX pass.
- **Commit at logical boundaries.** One commit per surface / one per bug class, with a descriptive body that explains the *why*.
- **Don't add tests or test infrastructure unless explicitly asked.** Jest was deliberately removed — adding it back is a decision, not an incremental fix.

---

## Design tokens & color semantics

Canonical source: [tailwind.config.ts](tailwind.config.ts) + [styles/globals.css](styles/globals.css).

### Color

Ink is for primary text and the single primary action per page. Coral is for critical / warning states only (deny, over-budget, failed rewards). Neutrals carry everything else.

| Token | Hex | Use |
|---|---|---|
| `novo-ink` | `#0A0A0A` | Primary text, primary buttons, headlines |
| `novo-paper` | `#FFFFFF` | Pure white surfaces |
| `novo-surface` | `#FAFAF7` | Page background (warm off-white) |
| `novo-elevated` | `#FFFFFF` | Card surfaces |
| `novo-border` | `#E8E5DE` | Default hairline border |
| `novo-border-strong` | `#CFCAC0` | Emphasized border (hover, active) |
| `novo-subtle` | `#6B675E` | Secondary body text |
| `novo-muted` | `#9A958A` | Tertiary text, metadata |
| `novo-hover` | `#F4F1EA` | Row/card hover fill |
| `novo-oxblood` | `#6F1721` | Value-tag text |
| `novo-coral` | `#EF1F2D` | Critical state text/bg — **do not use for primary actions** |
| `novo-pink-tint` | `#FBE6EC` | Value-tag background |
| `novo-hot-pink` | `#D4356D` | Reserved accent (use sparingly) |

Semantic chip tones use Tailwind's `emerald-*` (positive / done), `amber-*` (warning / running-hot / urgent), `sky-*` (informational / approved-but-not-active). These are intentional exceptions to the novo palette because they carry universal status meaning.

### Type scale

Tight. Headlines earn their size with negative letter-spacing; small labels earn their size with `0.08em` uppercase tracking.

| Size | px | Common use |
|---|---|---|
| `text-2xs` | 11 | Eyebrow labels (uppercase, tracked), metadata |
| `text-xs` | 12 | Helper text, timestamps |
| `text-sm` | 13 | Secondary body, table cells |
| `text-base` | 14 | Default body |
| `text-lg` | 15 | Feed-row primary line |
| `text-xl` | 17 | Card titles |
| `text-2xl` | 20 | Section titles, big stat figures |
| `text-3xl` | 26 | Page headlines |
| `text-4xl` | 34 | Hero moments (unused so far) |

Font families:
- `font-sans` = **Inter** (default; set via `--font-inter` in [app/layout.tsx](app/layout.tsx))
- `font-display` = **Archivo Black** (reserved for deliberate display moments; currently used for the signin page in past revs — favor tight-tracked Inter semibold for headlines instead)
- `font-mono` = system monospace (unused currently; reach for it only if Linear-style hash/ID display is needed)

### Numerics

Any cell that displays money, counts, dates, or percentages gets `className="tabular"` (implemented as `font-variant-numeric: tabular-nums` in `globals.css`). Prevents column-width wobble.

### Radius + shadow

- `rounded-md` (6px) — buttons, inputs, inline pills
- `rounded-lg` (10px) — cards, sections
- `rounded-xl` (14px) — weighty cards (committee card header strip)
- `rounded-full` — avatars, status pills
- `shadow-card` — default card elevation
- `shadow-elevated` — sticky / floating / inverted cards (the "Waiting on you" ink card)

### Spacing + widths

Rely on Tailwind's spacing scale. Custom maxes in [tailwind.config.ts](tailwind.config.ts):
- `max-w-content` (720px) — prose-ish forms + confirmation pages
- `max-w-app` (1120px) — queues, dashboards
- `max-w-shell` (1280px) — landing dashboard + full-program views

---

## Primitive usage rules

Shared UI lives in [components/ui/](components/ui/). Prefer it over rolling new chrome in a page file.

### Button / LinkButton — [components/ui/Button.tsx](components/ui/Button.tsx)

Variants × sizes. Don't build custom button chrome in page files.

- `variant="primary"` — ink background, paper text. **One per page max.** The primary CTA.
- `variant="secondary"` — bordered, paper background. Adjacent actions.
- `variant="ghost"` — transparent, subtle text. Low-weight actions inside cards and rows.
- `variant="danger"` — coral background. Destructive final-step buttons only.
- `size="sm"` (h-7) / `"md"` (h-9) / `"lg"` (h-10).

`LinkButton` is the `<Link>`-wrapped version; identical variants/sizes.

### Card + CardHeader — [components/ui/Card.tsx](components/ui/Card.tsx)

Default rendered as a `<section>`. Pass `as="article" | "div"` when appropriate. `padded={false}` to control padding yourself.

`CardHeader` supplies the title + hint + right-aligned action pattern inside a card.

### EmptyState — [components/ui/EmptyState.tsx](components/ui/EmptyState.tsx)

Every view that can be empty has one. Props: `title`, `description`, optional `action`, optional `footnote`. No decorative icon (was removed in the first design review — title + description + CTA carry the weight).

Every empty state should tell the user **what would appear here** and, where appropriate, **how to create it**.

### PageHeader — [components/ui/PageHeader.tsx](components/ui/PageHeader.tsx)

Every non-dashboard page uses this. Slots: `eyebrow` (2xs uppercase tracked), `title` (3xl semibold), optional `description`, right-aligned `actions`, optional `back` link rendered above.

The dashboard renders its own bespoke greeting header instead — it's the product home.

### AppHeader — [components/layout/AppHeader.tsx](components/layout/AppHeader.tsx)

Rendered once in [app/layout.tsx](app/layout.tsx). It's the only persistent nav. Wordmark → `/dashboard`, role-filtered primary links, persistent `+ Recognize` CTA, user indicator. **Do not build per-page nav.** The header + `PageHeader`'s back-link is the full story.

### Status pills, eyebrows, and chips

- **Eyebrow label**: `text-2xs font-medium uppercase tracking-[0.08em] text-novo-muted` — use above section titles, in PageHeader, and as card section markers.
- **Value tag**: `bg-novo-pink-tint text-novo-oxblood` pill — only for Novo values.
- **Tier chip**: `border border-novo-border bg-novo-surface text-novo-subtle` — for "Tier 1 · peer", "Tier 2 · two approvers required", etc.
- **Status pill**: emerald / sky / amber / neutral tones by state (see [/committee/budget](app/committee/budget/page.tsx) for the canonical pattern).

---

## Data organization

### Layering

```
app/**                   ← routes, pages, server actions, client forms
components/ui/           ← shared primitives (no business logic)
components/<domain>/     ← feature components (read domain types, don't import db)
modules/<domain>/        ← services, types, schemas, mock stores
modules/dashboard/       ← view composers (call multiple services, return a shape)
lib/db.ts                ← single Prisma client, pinned to globalThis
auth.ts                  ← NextAuth config + resolveEmployeeByEmail
middleware.ts            ← auth()-as-middleware, role gates happen in-page
```

Pages call services directly or via view composers. Components receive plain shapes, never raw DB rows — convert at the service/view boundary.

### Mock / Prisma symmetry

Every reader and writer takes the shape:

```ts
const useMock = () => process.env.USE_MOCK_DATA === 'true'

export async function doThing(args): Promise<Result> {
  if (useMock()) {
    // in-memory path
  }
  // Prisma path
}
```

Both branches return the same TypeScript shape. Do not let the mock path and Prisma path diverge in observable behavior.

### Mock store pattern — globalThis-pinned

**Any mutable Map / Set that backs a mock store must be pinned to `globalThis`**, because Next.js 14 runs server actions in a separate webpack layer (`action-browser`) from server components — a plain module-scoped `new Map()` gives you two different instances, and state written by an action won't be visible to the page that reads it.

Canonical pattern (from [modules/nominations/mock-store.ts](modules/nominations/mock-store.ts)):

```ts
const globalForX = globalThis as unknown as {
  __novo_<domain>_<store>?: Map<string, Record>
}
const store: Map<string, Record> =
  globalForX.__novo_<domain>_<store> ?? new Map()
if (process.env.NODE_ENV !== 'production') {
  globalForX.__novo_<domain>_<store> = store
}
```

Applied to: nominations, budget (periods / pools / exceptions), catalog, rewards, committee, approvals/shared (mockActions), communication/engagement (reactions + comments), employees/service (mockRecognitionOverrides), scope-notes/service.

[lib/db.ts](lib/db.ts) uses the same pattern for the Prisma client.

### View composers

When a page needs data from multiple services, add a composer in `modules/dashboard/*-view.ts` (or similar). Do **not** inline multi-service assembly in the page component. Existing composers:

- `manager-view.ts`, `department-view.ts`, `committee-view.ts`, `people-team-view.ts`, `recipient-view.ts`
- `recognition-feed.ts` (cross-org feed, respects `recognition_preference`)

A composer may call other composers. It never calls Prisma directly — it goes through service modules so the mock path works.

### Schemas + validation

- Zod schemas live next to the service: [modules/nominations/schema.ts](modules/nominations/schema.ts) for `NominationInputSchema`.
- Validate at the service entry point, not in the server action.
- Evidence URLs must match `^https?://` — Zod's `.url()` alone is an XSS vector (see [modules/nominations/schema.ts](modules/nominations/schema.ts#L21-L36) for the refine).

### Async discipline

- Every `async` call inside a server action that you don't `await` must end in `.catch(err => console.error(...))`. A fire-and-forget that rejects after `redirect()` has closed the request will escalate into an unhandled rejection and can crash the dev server on Node 20+.
- Canonical example: the Slack DM fire-and-forget in [app/nominations/actions.ts](app/nominations/actions.ts#L109-L115).
- `redirect()` from `next/navigation` throws `NEXT_REDIRECT`. **Never call `redirect()` inside a `try/catch`** — it will swallow the control-flow throw and the redirect will not happen.

---

## Naming conventions

### Files

- `mock-store.ts`, `manager-view.ts`, `recognition-feed.ts` — kebab-case for `.ts`.
- `NominationForm.tsx`, `ApprovalCard.tsx`, `AppHeader.tsx` — PascalCase for `.tsx` components.
- `types.ts`, `constants.ts`, `schema.ts`, `service.ts` — the four standard names inside each module.

### Symbols

- Services export `verbNoun` functions: `createNomination`, `approveNomination`, `listMockCatalogItems`.
- Mock-only helpers suffix `Mock`: `findByIdMock`, `listAllMock`, `insertMockPool`.
- Reset helpers: `resetMock<Domain>()`.
- `globalThis` keys: `__novo_<domain>_<store>` — always prefixed `__novo_` to avoid collision with other packages.
- Record types suffix `Record`: `NominationRecord`, `BudgetPeriodRecord`, `CommitteeDecisionRecord`.

### Fields

- **Snake_case** for any field that maps to the DB / Prisma schema or survives into a serialized shape: `nominee_id`, `behavior_text`, `submitted_at`, `value_id`, `current_tier`, `recognition_preference`. This matches the Prisma schema and keeps mock/DB parity trivial.
- **camelCase** for TS-local variables, function args, and props: `employeeId`, `nominatorName`, `isSelfApprovalPath`.
- **UPPER_SNAKE** for env vars: `USE_MOCK_DATA`, `AUTH_GOOGLE_ID`, `TREMENDOUS_SANDBOX`.
- **Prefixed IDs** for seeded/generated records: `emp_002`, `val_run_for_the_bus`, `nom_<uuid>`, `rew_<uuid>`, `act_<uuid>`.

### Commit messages

`Topic: short summary` headline, wrapped body, one-sentence-per-reason prose. Body explains *why* the change was made and what the reader needs to know that the diff doesn't tell them. Examples already in `git log`:

- `Dashboard: feed-first product home, CTA, pending, pool`
- `Bug sweep: pin 8 mock stores to globalThis + fix fire-and-forget + block javascript: evidence URLs`
- `UI: persistent wordmark nav + explicit "Back to dashboard" on confirmation`

Sign with:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Build discipline

### Local dev

```
npm run dev        # Next.js on :3000, .env.local for flags
npm run typecheck  # tsc --noEmit — must be clean before committing
npm run lint       # next lint
```

No `test` script exists — Jest and the `tests/` folder were removed. Don't add them back without discussion.

### Env flags that matter

- `USE_MOCK_DATA=true` — hard requirement for the dev-email signin to appear and for all mock-store paths to take effect.
- `DATABASE_URL` — placeholder in `.env.local` by default. Real Prisma queries never fire in mock mode.
- `NODE_ENV` — `development` locally; `production` disables the dev-signin provider belt-and-suspenders.

### Before declaring a change done

1. `npx tsc --noEmit` → clean.
2. Hit the affected routes through the running dev server with curl (or a small tsx script for server actions). Confirm status codes and a couple of expected content markers.
3. For redesign passes: at minimum verify the empty and populated variants of each touched surface.
4. For bug fixes: reproduce first, fix, reproduce again, confirm it no longer repros.

### Dev server hygiene

- After changes to `tailwind.config.ts` or adding new Tailwind token classes, restart the dev server (and `rm -rf .next/cache`) or Tailwind may serve stale class errors.
- Don't `kill` the user's dev server without telling them. Restarting is authorized in "fix this now" contexts; otherwise ask.

---

## Review discipline

### Surface-level passes

A "design pass" / "bug sweep" / "redesign across surfaces" is structured work, not an ad-hoc edit. Standard shape:

1. **Audit first.** List the surfaces / files in scope. Read them. Confirm scope with the user if it's not crystal.
2. **Foundation commit.** If the pass introduces shared tokens or primitives, land them first as a single commit. Subsequent per-surface commits use them.
3. **One commit per surface.** `Dashboard:` commit. `Approvals:` commit. `Committee:` commit. Message body spells out what got the new treatment and what intentionally didn't.
4. **Verify each surface before committing.** Typecheck + live curl. For forms, exercise the happy path.
5. **Walkthrough at the end.** Summary of which commit did what, grouped by surface, with file links.

This is how the design pass on 2026-04-22 was run; the resulting log is the template.

### Subagents for broad sweeps

Use three parallel Explore subagents for large bug sweeps:
- **State / persistence sweep** — cross-webpack-layer mock stores, Prisma client duplication, module-level caches.
- **Async error sweep** — `void somePromise()`, unawaited promises, `setTimeout(async …)`, silent catches of real errors.
- **Security / Next.js correctness sweep** — server-action authz gaps, input validation at route boundaries, open-redirect / XSS vectors, Next-14-vs-15 API mismatches.

Launch in parallel; while they run, do the pattern fixes you already know about. Merge findings in at the end.

### What *not* to change in a redesign

- Routes.
- Form field names (they're the server-action contract).
- Zod schemas (unless the task is explicitly about validation).
- Service function signatures.
- Commit messages that are already in `main`.

If a redesign legitimately needs one of the above, stop and confirm.

### Pushback

If the user asks for something that contradicts an established convention or has known bad consequences, push back before executing. Past examples:
- Destructive operations (deleting tests, force-pushing, rewriting history) — confirm scope and blast radius, even when the user is explicit. Flag what will be lost.
- "Quick fixes" that would revive a class of bug — e.g., putting a mock store back into a module-scoped `Map` without globalThis. Say no and explain.

---

## History

A few things that shaped the current conventions — these aren't folklore, they're the reason these rules exist:

- **Mock-store cross-layer bug** (2026-04-21). A freshly-submitted nomination wasn't visible to the confirmation page because the server-action webpack layer and the server-component layer held different `Map` instances. Fix: globalThis-pin every mock store. Eight stores migrated in one bug-sweep commit.
- **Fire-and-forget Slack DM** — `void sendApproverDM(nom)` before `redirect()` could crash the dev server via unhandled rejection. Fix: wrap in `.catch()`. Pattern now applies to every unawaited async call in a server action.
- **XSS via `javascript:` evidence URL** — Zod's `.url()` accepts `javascript:alert(1)`. Fix: refine to `^https?://`. Both the web form and the Slack modal go through the same schema, so the single refine closes both entry points.
- **Dashboard redesign, first review** (2026-04-22). Copy simplification (no poetic interface text — Rubina owns the copy pass later); admin vs employee sidebar split; empty-state layout collapses to single-column when there's no content on either side.
- **Jest removed**. Test infrastructure was intentionally dropped per user decision. Verification is now typecheck + targeted smoke. Don't re-introduce it without authorization.
