import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetGateService } from './asset-gate.service';
import type { OrganizationSettingsService } from './organization-settings.service';

describe('AssetGateService', () => {
  let organizationSettingsService: { patchAll: ReturnType<typeof vi.fn> };
  let accessBootstrapCacheService: {
    invalidateForOrganization: ReturnType<typeof vi.fn>;
  };
  let logger: { warn: ReturnType<typeof vi.fn> };
  let service: AssetGateService;

  beforeEach(() => {
    organizationSettingsService = { patchAll: vi.fn() };
    accessBootstrapCacheService = { invalidateForOrganization: vi.fn() };
    logger = { warn: vi.fn() };

    service = new AssetGateService(
      organizationSettingsService as unknown as OrganizationSettingsService,
      accessBootstrapCacheService as unknown as AccessBootstrapCacheService,
      logger as unknown as LoggerService,
    );
  });

  it('flips the flag atomically and invalidates the org cache on first asset', async () => {
    organizationSettingsService.patchAll.mockResolvedValue({
      modifiedCount: 1,
    });

    await service.markFirstAssetGenerated('org-1');

    // Monotonic false -> true, scoped to the org, only where still unset.
    expect(organizationSettingsService.patchAll).toHaveBeenCalledWith(
      {
        hasGeneratedFirstAsset: false,
        isDeleted: false,
        organizationId: 'org-1',
      },
      { hasGeneratedFirstAsset: true },
    );
    expect(
      accessBootstrapCacheService.invalidateForOrganization,
    ).toHaveBeenCalledWith('org-1');
  });

  it('does NOT invalidate when the flag was already set (no transition)', async () => {
    organizationSettingsService.patchAll.mockResolvedValue({
      modifiedCount: 0,
    });

    await service.markFirstAssetGenerated('org-1');

    expect(organizationSettingsService.patchAll).toHaveBeenCalledTimes(1);
    expect(
      accessBootstrapCacheService.invalidateForOrganization,
    ).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    null,
    '',
  ])('no-ops on a missing organization id (%s)', async (organizationId) => {
    await service.markFirstAssetGenerated(organizationId);

    expect(organizationSettingsService.patchAll).not.toHaveBeenCalled();
    expect(
      accessBootstrapCacheService.invalidateForOrganization,
    ).not.toHaveBeenCalled();
  });

  it('swallows and logs errors so generation is never broken', async () => {
    organizationSettingsService.patchAll.mockRejectedValue(
      new Error('db down'),
    );

    await expect(
      service.markFirstAssetGenerated('org-1'),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(
      accessBootstrapCacheService.invalidateForOrganization,
    ).not.toHaveBeenCalled();
  });
});
