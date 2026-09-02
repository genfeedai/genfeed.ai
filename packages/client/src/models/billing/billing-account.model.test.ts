import { BillingAccountStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { BillingAccount } from './billing-account.model';

describe('BillingAccount', () => {
  it('constructs with partial data', () => {
    const account = new BillingAccount({
      id: 'ba_1',
      status: BillingAccountStatus.UNPROVISIONED,
    });
    expect(account.id).toBe('ba_1');
    expect(account.status).toBe(BillingAccountStatus.UNPROVISIONED);
  });
});
