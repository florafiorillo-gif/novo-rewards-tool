/** @jest-environment node */
import {
  __getStubAdapterForTests,
  getVendorAdapter,
} from '@/modules/fulfillment/stubs'

beforeEach(() => {
  __getStubAdapterForTests().reset()
})

describe('StubVendorAdapter', () => {
  it('issueGiftCard returns a receipt with a reference id', async () => {
    const receipt = await getVendorAdapter().issueGiftCard({
      recipient_email: 'a@novo.co',
      recipient_name: 'Alex',
      amount_usd: 100,
      geo: 'US',
      reward_type: 'gift_card',
    })
    expect(receipt.vendor_reference_id).toMatch(/^stub_/)
    expect(receipt.issued_at).toBeInstanceOf(Date)
  })

  it('records every call for introspection', async () => {
    const adapter = getVendorAdapter()
    await adapter.issueGiftCard({
      recipient_email: 'a@novo.co',
      recipient_name: 'Alex',
      amount_usd: 75,
      geo: 'US',
      reward_type: 'gift_card',
    })
    await adapter.issueCash({
      recipient_email: 'b@novo.co',
      recipient_name: 'Bob',
      amount_usd: 200,
      geo: 'India',
      reward_type: 'cash',
    })
    const calls = __getStubAdapterForTests().getCalls()
    expect(calls).toHaveLength(2)
    expect(calls[0].method).toBe('issueGiftCard')
    expect(calls[1].method).toBe('issueCash')
    expect(calls[1].args.amount_usd).toBe(200)
  })
})
