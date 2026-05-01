import { tierLabel } from '@/modules/nominations/types'

// Shared tier chip used by recipient-perspective surfaces — the home
// recognition feed and the My team feed. Renders the canonical
// Peer / Spot / Impact / Ceremonial label for the given tier number.
//
// ApprovalCard has its own TierChip on purpose: approvers think in
// tier numbers ("Tier 2 needs two approvers") so it shows
// "Tier 1 · manager approval" / "Tier 2 · two approvers required" /
// "Tier 3 · committee" instead.
export function TierChip({ tier }: { tier: number }) {
  return (
    <span className="inline-flex items-center rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700">
      {tierLabel(tier)}
    </span>
  )
}
