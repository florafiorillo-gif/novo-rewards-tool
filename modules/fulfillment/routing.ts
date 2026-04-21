import type { Geo, EmploymentType } from '@/modules/employees/types'
import type { DeliveryMechanism, RewardType } from '@/modules/rewards/types'

// Spec §8.1 — which delivery path handles this reward? Colombia is
// always manual regardless of platform choice. Cash is payroll per geo.
// Everything else in US/India routes to the vendor platform.

export interface DeliveryRoutingArgs {
  geo: Geo
  reward_type: RewardType
  employment_type?: EmploymentType
}

export function resolveDeliveryMechanism(
  args: DeliveryRoutingArgs
): DeliveryMechanism {
  if (args.reward_type === 'custom') return 'manual'
  if (args.geo === 'Colombia') return 'manual'

  if (args.reward_type === 'cash') {
    if (args.geo === 'US') return 'justworks_csv'
    if (args.geo === 'India') return 'zoho_payroll'
    return 'manual' // never reached thanks to the Colombia check above
  }

  // Non-cash US/India: platform (Tremendous/Tango — stubbed for Phase 5).
  return 'tremendous'
}

// True when delivery requires People Ops manual handling rather than the
// vendor adapter.
export function isManualDelivery(mechanism: DeliveryMechanism): boolean {
  return mechanism === 'manual' || mechanism === 'justworks_csv' || mechanism === 'zoho_payroll'
}
