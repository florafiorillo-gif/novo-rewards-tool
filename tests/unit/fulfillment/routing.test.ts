/** @jest-environment node */
import {
  isManualDelivery,
  resolveDeliveryMechanism,
} from '@/modules/fulfillment/routing'

describe('resolveDeliveryMechanism (spec §8.1)', () => {
  it('US gift card → tremendous (stub)', () => {
    expect(
      resolveDeliveryMechanism({ geo: 'US', reward_type: 'gift_card' })
    ).toBe('tremendous')
  })

  it('India gift card → tremendous (stub)', () => {
    expect(
      resolveDeliveryMechanism({ geo: 'India', reward_type: 'gift_card' })
    ).toBe('tremendous')
  })

  it('Colombia gift card → manual (always)', () => {
    expect(
      resolveDeliveryMechanism({ geo: 'Colombia', reward_type: 'gift_card' })
    ).toBe('manual')
  })

  it('Colombia experience → manual (always)', () => {
    expect(
      resolveDeliveryMechanism({ geo: 'Colombia', reward_type: 'experience' })
    ).toBe('manual')
  })

  it('US cash → justworks_csv', () => {
    expect(resolveDeliveryMechanism({ geo: 'US', reward_type: 'cash' })).toBe(
      'justworks_csv'
    )
  })

  it('India cash → zoho_payroll', () => {
    expect(
      resolveDeliveryMechanism({ geo: 'India', reward_type: 'cash' })
    ).toBe('zoho_payroll')
  })

  it('Colombia cash → manual (Colombia rule wins over cash default)', () => {
    expect(
      resolveDeliveryMechanism({ geo: 'Colombia', reward_type: 'cash' })
    ).toBe('manual')
  })

  it('custom → manual regardless of geo', () => {
    expect(resolveDeliveryMechanism({ geo: 'US', reward_type: 'custom' })).toBe(
      'manual'
    )
    expect(
      resolveDeliveryMechanism({ geo: 'India', reward_type: 'custom' })
    ).toBe('manual')
  })
})

describe('isManualDelivery', () => {
  it('manual, justworks_csv, zoho_payroll all require People Ops', () => {
    expect(isManualDelivery('manual')).toBe(true)
    expect(isManualDelivery('justworks_csv')).toBe(true)
    expect(isManualDelivery('zoho_payroll')).toBe(true)
  })
  it('tremendous is not manual', () => {
    expect(isManualDelivery('tremendous')).toBe(false)
  })
})
