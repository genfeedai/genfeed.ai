import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminCreditHoldsController } from '@api/endpoints/admin/credit-holds/credit-holds.controller';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

describe('credit hold operator boundary', () => {
  it('requires both IP allow-list and platform super-admin guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminCreditHoldsController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });
  it('rejects arbitrary charge amounts and missing reasons before any monetary call', async () => {
    const service = { apply: vi.fn(), list: vi.fn() };
    const controller = new AdminCreditHoldsController(service as never);
    const request = { context: { userId: 'operator' } };
    for (const body of [
      { action: 'charge' },
      { action: 'charge', reason: 'Provider verified', amount: 999 },
      { action: 'release', reason: 'short' },
    ]) {
      await expect(
        controller.act(request as never, 'org', 'hold', body),
      ).rejects.toThrow();
    }
    expect(service.apply).not.toHaveBeenCalled();
  });
  it('rejects a missing operator identity before applying an action', async () => {
    const service = { apply: vi.fn(), list: vi.fn() };
    const controller = new AdminCreditHoldsController(service as never);
    await expect(
      controller.act({} as never, 'org', 'hold', {
        action: 'charge',
        reason: 'Provider verified',
      }),
    ).rejects.toThrow();
    expect(service.apply).not.toHaveBeenCalled();
  });
});
