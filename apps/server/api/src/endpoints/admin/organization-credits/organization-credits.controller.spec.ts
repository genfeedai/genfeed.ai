import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOrganizationCreditsController } from '@api/endpoints/admin/organization-credits/organization-credits.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

function createService() {
  return {
    addOrganizationCreditsWithExpiration: vi.fn().mockResolvedValue(undefined),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(500),
  };
}

describe('admin organization credit grant', () => {
  it('requires both IP allow-list and platform super-admin guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminOrganizationCreditsController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it('grants credits to the path organization and reports the balance', async () => {
    const service = createService();
    const controller = new AdminOrganizationCreditsController(service as never);
    const result = await controller.grant(
      { context: { userId: 'operator' } } as never,
      'org-1',
      {
        amount: 500,
        idempotencyKey: 'grant-org-1-500',
        reason: 'Onboarding grant',
      },
    );

    expect(service.addOrganizationCreditsWithExpiration).toHaveBeenCalledWith(
      'org-1',
      500,
      'admin-grant',
      'Onboarding grant',
      expect.any(Date),
      { actorUserId: 'operator', idempotencyKey: 'grant-org-1-500' },
    );
    expect(result.data).toMatchObject({
      balance: 500,
      creditsGranted: 500,
      organizationId: 'org-1',
    });
  });

  it('rejects bad amounts, missing reasons and unknown fields before any ledger write', async () => {
    const service = createService();
    const controller = new AdminOrganizationCreditsController(service as never);
    const request = { context: { userId: 'operator' } } as never;
    for (const body of [
      { amount: 0, reason: 'Onboarding grant' },
      { amount: -5, reason: 'Onboarding grant' },
      { amount: 1.5, reason: 'Onboarding grant' },
      { amount: 500 },
      { amount: 500, reason: 'short' },
      { amount: 500, organizationId: 'other', reason: 'Onboarding grant' },
    ]) {
      await expect(controller.grant(request, 'org-1', body)).rejects.toThrow();
    }
    expect(service.addOrganizationCreditsWithExpiration).not.toHaveBeenCalled();
  });

  it('rejects a missing operator identity', async () => {
    const service = createService();
    const controller = new AdminOrganizationCreditsController(service as never);
    await expect(
      controller.grant({} as never, 'org-1', {
        amount: 500,
        reason: 'Onboarding grant',
      }),
    ).rejects.toThrow();
    expect(service.addOrganizationCreditsWithExpiration).not.toHaveBeenCalled();
  });
});
