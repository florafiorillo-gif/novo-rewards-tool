import { randomUUID } from 'crypto'
import type {
  VendorAdapter,
  VendorIssueArgs,
  VendorReceipt,
} from './vendor'

// Stub vendor adapter used until Finance picks Tremendous vs Tango.
// Records every call with params and returns a fake receipt. Swap for
// the real adapter by replacing `getVendorAdapter()` below.

export class StubVendorAdapter implements VendorAdapter {
  readonly name = 'stub'
  private calls: Array<{ method: string; args: VendorIssueArgs; receipt: VendorReceipt }> = []

  async issueGiftCard(args: VendorIssueArgs): Promise<VendorReceipt> {
    return this.record('issueGiftCard', args)
  }

  async issueCash(args: VendorIssueArgs): Promise<VendorReceipt> {
    return this.record('issueCash', args)
  }

  async issueExperience(args: VendorIssueArgs): Promise<VendorReceipt> {
    return this.record('issueExperience', args)
  }

  // For tests and dev introspection.
  getCalls(): ReadonlyArray<{ method: string; args: VendorIssueArgs; receipt: VendorReceipt }> {
    return this.calls
  }

  reset(): void {
    this.calls = []
  }

  private record(method: string, args: VendorIssueArgs): VendorReceipt {
    const receipt: VendorReceipt = {
      vendor_reference_id: `stub_${randomUUID()}`,
      issued_at: new Date(),
      internal_note: 'Issued by stub adapter — no real vendor call',
    }
    this.calls.push({ method, args, receipt })
    return receipt
  }
}

// Module-level singleton so tests and app code see the same call log.
const _instance = new StubVendorAdapter()

export function getVendorAdapter(): VendorAdapter {
  // Real adapter selection goes here once Finance decides. For now always
  // return the stub. Colombia never reaches this path — manual queue only.
  return _instance
}

// Exposed for tests + /people-ops/fulfillment debugging.
export function __getStubAdapterForTests(): StubVendorAdapter {
  return _instance
}
