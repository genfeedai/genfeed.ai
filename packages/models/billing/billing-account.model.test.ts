import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  BillingAccount: class BaseBillingAccount {
    id?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { BillingAccount } from '@models/billing/billing-account.model';

describe('BillingAccount', () => {
  it('constructs with partial data', () => {
    const account = new BillingAccount({ id: 'ba_1' });
    expect(account.id).toBe('ba_1');
  });
});
