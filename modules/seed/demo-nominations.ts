import { randomUUID } from 'crypto'
import type { NominationRecord } from '@/modules/nominations/types'

// ~35 nominations + 4-nomination team award group. Dates span Apr 1 to
// Apr 22 (current period Q2 2026 started Apr 1; seed uses Apr 23 as
// "today"). Behavior + outcome text deliberately in-character Novo
// prose — this data is used to evaluate the feed density and the per-
// role landing pages, so generic filler would undermine the eval.

const Y = 2026
const mar = (d: number, h = 10) => new Date(Y, 2, d, h) // March
const apr = (d: number, h = 10) => new Date(Y, 3, d, h) // April

interface Seed {
  id: string
  nominator_id: string
  nominee_id: string
  value_id: string
  behavior_text: string
  outcome_text: string
  submitted_at: Date
  current_tier: 1 | 2 | 3
  status: NominationRecord['status']
  approved_at?: Date | null
  denied_at?: Date | null
  current_approver_id: string | null
  tier2_dept_head_id?: string | null
  tier2_people_team_rep_id?: string | null
  team_award_group_id?: string | null
  urgent?: boolean
}

// Realistic Novo recognition stories. Values referenced by id from
// modules/values/constants.ts so a value rename would surface at compile.
const SEEDS: Seed[] = [
  // ── Team award: India migration group (4 noms, shared group id) ──────
  ...teamAward('team_q2_india_migration', apr(15, 14), [
    'emp_041',
    'emp_042',
    'emp_043',
    'emp_044',
  ]),

  // ── Tier 1 fulfilled (feed bulk) ─────────────────────────────────────
  {
    id: 'nom_demo_f_001',
    nominator_id: 'emp_005',
    nominee_id: 'emp_006',
    value_id: 'val_run_for_the_bus',
    behavior_text:
      'Pushed the auth refactor live the evening before the partner demo without waiting for the usual Friday deploy window.',
    outcome_text:
      'Demo team walked in Monday with the consolidated login flow instead of the split-brain one the prospect had flagged.',
    submitted_at: apr(3, 9),
    approved_at: apr(3, 11),
    current_tier: 1,
    status: 'fulfilled',
    current_approver_id: 'emp_005',
  },
  {
    id: 'nom_demo_f_002',
    nominator_id: 'emp_007',
    nominee_id: 'emp_006',
    value_id: 'val_assume_best_intention',
    behavior_text:
      'When the partnerships thread got tense, Jimi pulled the other lead into a direct call instead of escalating through leadership.',
    outcome_text:
      'The two of them rewrote the integration scope in a shared doc by end of day. No one had to referee.',
    submitted_at: apr(5, 15),
    approved_at: apr(6, 10),
    current_tier: 1,
    status: 'fulfilled',
    current_approver_id: 'emp_005',
  },
  {
    id: 'nom_demo_f_003',
    nominator_id: 'emp_020',
    nominee_id: 'emp_031',
    value_id: 'val_intellectual_honesty',
    behavior_text:
      "Flagged a bug in her own cohort analysis before the exec review — the conversion lift she'd reported was 4pp lower once dedup was applied.",
    outcome_text:
      'We went into the review with the right number. Saved us from committing to a roadmap bet we would have had to walk back.',
    submitted_at: apr(7, 11),
    approved_at: apr(7, 16),
    current_tier: 1,
    status: 'fulfilled',
    current_approver_id: 'emp_020',
  },
  {
    id: 'nom_demo_f_004',
    nominator_id: 'emp_008',
    nominee_id: 'emp_045',
    value_id: 'val_run_for_the_bus',
    behavior_text:
      'Billie caught a regression in the release candidate at 8pm IST and stayed on to walk the on-call engineer through a repro path.',
    outcome_text:
      'We held the release, fixed it overnight, and shipped clean the next morning instead of rolling back in production.',
    submitted_at: apr(8, 14),
    approved_at: apr(9, 9),
    current_tier: 1,
    status: 'fulfilled',
    current_approver_id: 'emp_008',
  },
  {
    id: 'nom_demo_f_005',
    nominator_id: 'emp_023',
    nominee_id: 'emp_029',
    value_id: 'val_hierarchy_not_authority',
    behavior_text:
      'Pushed back on the header treatment I had signed off on, made the case for a version I had rejected, and turned out to be right.',
    outcome_text:
      'The new header shipped with the relaunch. Signup completion is up, and the rest of the design system reads better next to it.',
    submitted_at: apr(10, 10),
    approved_at: apr(10, 15),
    current_tier: 1,
    status: 'fulfilled',
    current_approver_id: 'emp_023',
  },
  {
    id: 'nom_demo_f_006',
    nominator_id: 'emp_010',
    nominee_id: 'emp_050',
    value_id: 'val_run_for_the_bus',
    behavior_text:
      'Paul rewrote the Colombia payroll export over a weekend when the vendor switched format without notice.',
    outcome_text:
      'Payroll went out on time. We never told the Colombia team there was almost a problem.',
    submitted_at: apr(11, 13),
    approved_at: apr(12, 9),
    current_tier: 1,
    status: 'fulfilled',
    current_approver_id: 'emp_010',
  },
  {
    id: 'nom_demo_f_007',
    nominator_id: 'emp_021',
    nominee_id: 'emp_027',
    value_id: 'val_intellectual_honesty',
    behavior_text:
      'Whitney told me the campaign we had funded was not working before anyone had asked for a mid-quarter review.',
    outcome_text:
      'We killed it at week four instead of at end of quarter. Reallocated the spend to the partner webinar series that is actually converting.',
    submitted_at: apr(13, 10),
    approved_at: apr(13, 14),
    current_tier: 1,
    status: 'fulfilled',
    current_approver_id: 'emp_021',
  },
  {
    id: 'nom_demo_f_008',
    nominator_id: 'emp_022',
    nominee_id: 'emp_028',
    value_id: 'val_assume_best_intention',
    behavior_text:
      'A customer email came in written in all caps and Otis wrote back assuming they were frustrated, not hostile. Got on a call same day.',
    outcome_text:
      "The account renewed at a higher tier this week. The customer cited the 'humans not tickets' treatment in the CSAT survey.",
    submitted_at: apr(14, 9),
    approved_at: apr(14, 15),
    current_tier: 1,
    status: 'fulfilled',
    current_approver_id: 'emp_022',
  },
  {
    id: 'nom_demo_f_009',
    nominator_id: 'emp_005',
    nominee_id: 'emp_024',
    value_id: 'val_hierarchy_not_authority',
    behavior_text:
      "Freddie made the call to pause the migration plan I had approved and rerun the benchmark. He'd spotted a read-pattern we missed.",
    outcome_text:
      'The revised plan cut the cutover window from six hours to under two. His version of the sequencing is now the template.',
    submitted_at: apr(16, 11),
    approved_at: apr(16, 17),
    current_tier: 1,
    status: 'fulfilled',
    current_approver_id: 'emp_005',
  },
  {
    id: 'nom_demo_f_010',
    nominator_id: 'emp_030',
    nominee_id: 'emp_048',
    value_id: 'val_run_for_the_bus',
    behavior_text:
      'Dolly stood up a temporary triage channel inside two hours when the status-page incident broke over an Indian holiday.',
    outcome_text:
      'Customers got hourly updates. Churn signal from the incident is effectively zero this week.',
    submitted_at: apr(18, 14),
    approved_at: apr(19, 10),
    current_tier: 1,
    status: 'fulfilled',
    current_approver_id: 'emp_001',
  },

  // ── Tier 1 submitted (waiting on manager) — populates pending count ──
  {
    id: 'nom_demo_s_001',
    nominator_id: 'emp_007',
    nominee_id: 'emp_025',
    value_id: 'val_intellectual_honesty',
    behavior_text:
      "Bonnie's memo on the indexing work told the uncomfortable truth about what we skipped in the first pass. She wrote it before she had to.",
    outcome_text:
      'Gave the next team clear eyes on what they were inheriting instead of discovering it the hard way.',
    submitted_at: apr(20, 16),
    current_tier: 1,
    status: 'submitted',
    current_approver_id: 'emp_024',
  },
  {
    id: 'nom_demo_s_002',
    nominator_id: 'emp_006',
    nominee_id: 'emp_007',
    value_id: 'val_assume_best_intention',
    behavior_text:
      'Janis took the hit on a schedule miss publicly and then talked to the person whose ticket it was in DM, not the thread.',
    outcome_text:
      "Kept a rough week from turning into a team morale thing. That PM is still doing the work; she'd have taken a week to recover if it had blown up publicly.",
    submitted_at: apr(21, 10),
    current_tier: 1,
    status: 'submitted',
    current_approver_id: 'emp_005',
  },
  {
    id: 'nom_demo_s_003',
    nominator_id: 'emp_046',
    nominee_id: 'emp_047',
    value_id: 'val_run_for_the_bus',
    behavior_text:
      "Sade built the vendor reconciliation report before the request landed. She'd seen the pattern coming.",
    outcome_text:
      'Month-end close is two days faster this period than last. No one asked her to do it — she just did.',
    submitted_at: apr(22, 11),
    current_tier: 1,
    status: 'submitted',
    current_approver_id: 'emp_046',
  },

  // ── Tier 1 approved (waiting on reward selection by nominator) ───────
  {
    id: 'nom_demo_a_001',
    nominator_id: 'emp_008',
    nominee_id: 'emp_040',
    value_id: 'val_hierarchy_not_authority',
    behavior_text:
      'Charlie challenged my initial architecture call for the new service in the review meeting, in front of the whole team.',
    outcome_text:
      "He was right and we went with his approach. The fact that he did it publicly set a better tone than 'DM me later'.",
    submitted_at: apr(19, 9),
    approved_at: apr(19, 14),
    current_tier: 1,
    status: 'approved',
    current_approver_id: 'emp_008',
  },

  // ── Tier 2 under_review (dept head + People team rep to approve) ─────
  {
    id: 'nom_demo_t2_u_001',
    nominator_id: 'emp_005',
    nominee_id: 'emp_044',
    value_id: 'val_run_for_the_bus',
    behavior_text:
      "Selena owned the India-side cutover of the identity service end-to-end — including the coordination with Ops that wasn't her job.",
    outcome_text:
      'Zero customer-visible downtime. The India team operated the new system from day one without hand-holding.',
    submitted_at: apr(17, 11),
    current_tier: 2,
    status: 'under_review',
    current_approver_id: null,
    tier2_dept_head_id: 'emp_008',
    tier2_people_team_rep_id: 'emp_002',
  },
  {
    id: 'nom_demo_t2_u_002',
    nominator_id: 'emp_020',
    nominee_id: 'emp_026',
    value_id: 'val_intellectual_honesty',
    behavior_text:
      "Ringo raised his own call on the pricing experiment — said the lift wasn't real once we corrected for seasonality.",
    outcome_text:
      'We did not ship the 15% price bump. The revised experiment with the correct comparison is running cleanly now.',
    submitted_at: apr(20, 9),
    current_tier: 2,
    status: 'under_review',
    current_approver_id: null,
    tier2_dept_head_id: 'emp_020',
    tier2_people_team_rep_id: 'emp_004',
  },

  // ── Tier 2 approved (awaiting reward selection) ──────────────────────
  {
    id: 'nom_demo_t2_a_001',
    nominator_id: 'emp_023',
    nominee_id: 'emp_029',
    value_id: 'val_hierarchy_not_authority',
    behavior_text:
      'Etta reorganized the design crit process after sitting through three that felt broken. Proposed the new format, ran it herself.',
    outcome_text:
      'Design crits are now the session the engineers want to be in. Other teams are asking how we structure them.',
    submitted_at: apr(11, 16),
    approved_at: apr(14, 11),
    current_tier: 2,
    status: 'approved',
    current_approver_id: null,
    tier2_dept_head_id: 'emp_023',
    tier2_people_team_rep_id: 'emp_002',
  },

  // ── Tier 2 fulfilled ────────────────────────────────────────────────
  {
    id: 'nom_demo_t2_f_001',
    nominator_id: 'emp_022',
    nominee_id: 'emp_028',
    value_id: 'val_run_for_the_bus',
    behavior_text:
      'Otis closed the largest deal of the quarter by shifting to a services-first pitch mid-cycle when the product-led angle was not landing.',
    outcome_text:
      '$180k ARR signed, six weeks faster than the original timeline. The services angle is now in the standard playbook for enterprise.',
    submitted_at: apr(4, 10),
    approved_at: apr(7, 12),
    current_tier: 2,
    status: 'fulfilled',
    current_approver_id: null,
    tier2_dept_head_id: 'emp_022',
    tier2_people_team_rep_id: 'emp_004',
  },
  {
    id: 'nom_demo_t2_f_002',
    nominator_id: 'emp_005',
    nominee_id: 'emp_006',
    value_id: 'val_assume_best_intention',
    behavior_text:
      'Jimi led the onboarding of three new engineers across two time zones — wrote the doc, ran the sessions, hung out in the learning channel for weeks.',
    outcome_text:
      'All three shipped production code in their first month. The onboarding doc is now what everyone new gets pointed to first.',
    submitted_at: apr(2, 11),
    approved_at: apr(5, 15),
    current_tier: 2,
    status: 'fulfilled',
    current_approver_id: null,
    tier2_dept_head_id: 'emp_005',
    tier2_people_team_rep_id: 'emp_002',
  },

  // ── Tier 3 under_review (committee queue) ────────────────────────────
  {
    id: 'nom_demo_t3_u_001',
    nominator_id: 'emp_001',
    nominee_id: 'emp_008',
    value_id: 'val_run_for_the_bus',
    behavior_text:
      "Ravi made the call to rewrite the India team's entire deployment pipeline when the third outage in a month traced to the same root cause.",
    outcome_text:
      'Uptime across India-hosted services is at a quarterly high. The new pipeline is now also running US services in shadow mode.',
    submitted_at: apr(18, 9),
    current_tier: 3,
    status: 'under_review',
    current_approver_id: null,
    urgent: true,
  },
  {
    id: 'nom_demo_t3_u_002',
    nominator_id: 'emp_001',
    nominee_id: 'emp_023',
    value_id: 'val_hierarchy_not_authority',
    behavior_text:
      "Nina rebuilt the design system from scratch after pushing back on the 'ship what we have' plan everyone else had agreed to.",
    outcome_text:
      "We are not paying down six months of design debt on top of the current roadmap. The relaunch hit was worth the slip.",
    submitted_at: apr(20, 10),
    current_tier: 3,
    status: 'under_review',
    current_approver_id: null,
    urgent: false,
  },

  // ── Denied (pattern signal for People team) ──────────────────────────
  {
    id: 'nom_demo_d_001',
    nominator_id: 'emp_006',
    nominee_id: 'emp_025',
    value_id: 'val_intellectual_honesty',
    behavior_text:
      'Caught a subtle bug in the deploy script review.',
    outcome_text: 'Prevented a minor issue from reaching staging.',
    submitted_at: apr(9, 10),
    denied_at: apr(9, 17),
    current_tier: 1,
    status: 'denied',
    current_approver_id: 'emp_024',
  },
  {
    id: 'nom_demo_d_002',
    nominator_id: 'emp_041',
    nominee_id: 'emp_042',
    value_id: 'val_run_for_the_bus',
    behavior_text:
      'Wrote a new utility function that saved some time.',
    outcome_text: 'Code is cleaner now.',
    submitted_at: apr(12, 14),
    denied_at: apr(13, 9),
    current_tier: 1,
    status: 'denied',
    current_approver_id: 'emp_040',
  },
  {
    id: 'nom_demo_d_003',
    nominator_id: 'emp_047',
    nominee_id: 'emp_046',
    value_id: 'val_assume_best_intention',
    behavior_text: 'Was patient with a vendor who was late.',
    outcome_text: 'Good working relationship maintained.',
    submitted_at: apr(16, 10),
    denied_at: apr(17, 11),
    current_tier: 1,
    status: 'denied',
    current_approver_id: 'emp_046',
  },

  // ── Cancelled ─────────────────────────────────────────────────────────
  {
    id: 'nom_demo_c_001',
    nominator_id: 'emp_007',
    nominee_id: 'emp_006',
    value_id: 'val_run_for_the_bus',
    behavior_text:
      'Submitted a recognition and then realized the story was actually about a different teammate — withdrew to rewrite it correctly.',
    outcome_text: 'Rewrote and resubmitted the right nomination.',
    submitted_at: apr(6, 12),
    current_tier: 1,
    status: 'cancelled',
    current_approver_id: 'emp_005',
  },
]

function teamAward(group_id: string, at: Date, nominee_ids: string[]): Seed[] {
  // Engineering team award: India migration group. One nomination per
  // member, all sharing team_award_group_id. Tier 2 scope since a group
  // award crosses a single pool's budget reality.
  return nominee_ids.map((nominee_id, idx) => ({
    id: `nom_demo_team_${idx + 1}`,
    nominator_id: 'emp_008',
    nominee_id,
    value_id: 'val_run_for_the_bus',
    behavior_text:
      "Stayed on through the India migration weekend — handled one of the four migration streams end-to-end, including the rollback drill on Sunday.",
    outcome_text:
      'All four streams cut over without customer-visible downtime. The migration runbook from this work is now the template for future cutovers.',
    submitted_at: new Date(at.getTime() - 86400000),
    approved_at: at,
    current_tier: 2,
    status: 'fulfilled',
    current_approver_id: null,
    tier2_dept_head_id: 'emp_008',
    tier2_people_team_rep_id: 'emp_004',
    team_award_group_id: group_id,
  }))
}

export function buildDemoNominations(): NominationRecord[] {
  return SEEDS.map((s) => toRecord(s))
}

function toRecord(s: Seed): NominationRecord {
  const created = s.submitted_at
  const updated = s.approved_at ?? s.denied_at ?? created
  return {
    id: s.id,
    nominator_id: s.nominator_id,
    nominee_id: s.nominee_id,
    value_id: s.value_id,
    behavior_text: s.behavior_text,
    outcome_text: s.outcome_text,
    evidence_links: [],
    submitted_at: s.submitted_at,
    current_tier: s.current_tier,
    status: s.status,
    current_approver_id: s.current_approver_id,
    team_award_group_id: s.team_award_group_id ?? null,
    duplicate_of_id: null,
    tier2_dept_head_id: s.tier2_dept_head_id ?? null,
    tier2_people_team_rep_id: s.tier2_people_team_rep_id ?? null,
    urgent: s.urgent ?? false,
    last_nudge_at: null,
    last_escalation_at: null,
    approved_at: s.approved_at ?? null,
    denied_at: s.denied_at ?? null,
    acknowledged_at: null,
    post_fired_at: null,
    post_message_ts: null,
    created_at: created,
    updated_at: updated,
  }
}

// Reactions + comments. Keyed by nomination id; only on a subset of the
// fulfilled ones so the feed has engagement signal without drowning in
// chrome. Includes a mix of emoji types to exercise the reactions UI.
interface ReactionSeed {
  nomination_id: string
  user_id: string
  reaction_type: string
}
interface CommentSeed {
  nomination_id: string
  user_id: string
  text: string
}

export const DEMO_REACTIONS: ReactionSeed[] = [
  { nomination_id: 'nom_demo_f_001', user_id: 'emp_001', reaction_type: 'heart' },
  { nomination_id: 'nom_demo_f_001', user_id: 'emp_007', reaction_type: 'fire' },
  { nomination_id: 'nom_demo_f_001', user_id: 'emp_020', reaction_type: 'heart' },
  { nomination_id: 'nom_demo_f_003', user_id: 'emp_001', reaction_type: 'clap' },
  { nomination_id: 'nom_demo_f_003', user_id: 'emp_002', reaction_type: 'clap' },
  { nomination_id: 'nom_demo_f_005', user_id: 'emp_001', reaction_type: 'heart' },
  { nomination_id: 'nom_demo_f_005', user_id: 'emp_023', reaction_type: 'star' },
  { nomination_id: 'nom_demo_f_007', user_id: 'emp_002', reaction_type: 'clap' },
  { nomination_id: 'nom_demo_f_008', user_id: 'emp_022', reaction_type: 'fire' },
  { nomination_id: 'nom_demo_f_010', user_id: 'emp_001', reaction_type: 'heart' },
  { nomination_id: 'nom_demo_f_010', user_id: 'emp_030', reaction_type: 'clap' },
  { nomination_id: 'nom_demo_team_1', user_id: 'emp_001', reaction_type: 'fire' },
  { nomination_id: 'nom_demo_team_1', user_id: 'emp_002', reaction_type: 'heart' },
  { nomination_id: 'nom_demo_team_2', user_id: 'emp_001', reaction_type: 'fire' },
  { nomination_id: 'nom_demo_t2_f_001', user_id: 'emp_001', reaction_type: 'star' },
  { nomination_id: 'nom_demo_t2_f_002', user_id: 'emp_007', reaction_type: 'heart' },
]

export const DEMO_COMMENTS: CommentSeed[] = [
  {
    nomination_id: 'nom_demo_f_001',
    user_id: 'emp_020',
    text: 'This unblocked our demo too. Huge.',
  },
  {
    nomination_id: 'nom_demo_f_003',
    user_id: 'emp_001',
    text: 'This is the kind of self-correction we want to be routine.',
  },
  {
    nomination_id: 'nom_demo_f_005',
    user_id: 'emp_029',
    text: 'Agreed. The new header is better and it is not close.',
  },
  {
    nomination_id: 'nom_demo_f_010',
    user_id: 'emp_002',
    text: 'The triage channel template is getting added to the incident runbook.',
  },
  {
    nomination_id: 'nom_demo_team_1',
    user_id: 'emp_001',
    text: 'Proud of this whole crew. This is what Tier 2 scope is for.',
  },
]

// ID generator lives here so seed records get stable-looking ids but
// the engagement store inserts use randomUUID-backed ids — avoids the
// inserter having to worry about conflicts with its upsert semantics.
export function genReactionId(): string {
  return `rxn_demo_${randomUUID()}`
}
export function genCommentId(): string {
  return `cmt_demo_${randomUUID()}`
}
