import { isManager } from '@/modules/employees/service'

// Server-side gate for tiered (Tier 1+) nomination submissions. The
// /nominations/new UI gate (showTiered = views.has('manager')) decides
// whether the tiered form is *visible*; this helper enforces the same
// rule on every server entry point that creates a tiered nomination —
// the web action, the Slack modal submit handler, and the /recognize
// slash command.
//
// Decision: reject with an authz error rather than silently downgrade
// to peer. A silent downgrade means a user submits a Tier 1 form, sees
// a success message, and the recipient gets a peer recognition with
// manager-tier intent behind it. Confusing for everyone. Reject is the
// honest behaviour: the contract the UI promised was "tiered for
// managers" and the server enforces that.
//
// The check uses the actor's *real* role (isManager). Active-view
// simulation (?view=manager from the demo switcher) intentionally
// doesn't grant access here — simulation is view-composition only,
// per the modules/dashboard/views.ts contract.

export type TieredAuthzResult =
  | { ok: true }
  | { ok: false; code: 'not_authorized' }

export async function ensureCanInitiateTieredNomination(
  actorId: string
): Promise<TieredAuthzResult> {
  if (await isManager(actorId)) return { ok: true }
  return { ok: false, code: 'not_authorized' }
}

export const TIERED_AUTHZ_MESSAGE =
  'Recognition with reward is initiated by managers. To recognize a peer, use the peer-recognition path.'
