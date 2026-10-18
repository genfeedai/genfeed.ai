import { ModelCatalogSeedService } from '@api/seeds/model-catalog-seed.service';
import { PlatformTemplateSeedService } from '@api/seeds/platform-template-seed.service';
import { ReferenceDataSyncService } from '@api/seeds/reference-data-sync.service';
import { SkillCatalogSeedService } from '@api/seeds/skill-catalog-seed.service';
import { StudioElementSeedService } from '@api/seeds/studio-element-seed.service';
import { StudioPresetSeedService } from '@api/seeds/studio-preset-seed.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/seeds/reviewed-provider-rates-seed', () => ({
  seedReviewedProviderRates: vi.fn().mockResolvedValue(0),
}));

describe('ReferenceDataSyncService', () => {
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let models: { reconcileCatalog: ReturnType<typeof vi.fn> };
  let skills: {
    backfillOrganizations: ReturnType<typeof vi.fn>;
    reconcileCatalog: ReturnType<typeof vi.fn>;
  };
  let platformTemplates: { reconcileCatalog: ReturnType<typeof vi.fn> };
  let studioPresets: { reconcileCatalog: ReturnType<typeof vi.fn> };
  let studioElements: { reconcileCatalog: ReturnType<typeof vi.fn> };
  let service: ReferenceDataSyncService;

  beforeEach(() => {
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    models = {
      reconcileCatalog: vi.fn().mockResolvedValue({ unchanged: 3, written: 1 }),
    };
    skills = {
      backfillOrganizations: vi.fn().mockResolvedValue(0),
      reconcileCatalog: vi
        .fn()
        .mockResolvedValue({ inserted: 0, skipped: 4, updated: 1 }),
    };
    platformTemplates = {
      reconcileCatalog: vi
        .fn()
        .mockResolvedValue({ keys: [], unchanged: 3, written: 1 }),
    };
    studioPresets = {
      reconcileCatalog: vi.fn().mockResolvedValue({ unchanged: 6, written: 0 }),
    };
    studioElements = {
      reconcileCatalog: vi
        .fn()
        .mockResolvedValue({ failed: [], unchanged: 10, written: 0 }),
    };
    service = new ReferenceDataSyncService(
      logger as unknown as LoggerService,
      models as unknown as ModelCatalogSeedService,
      platformTemplates as unknown as PlatformTemplateSeedService,
      {} as PrismaService,
      skills as unknown as SkillCatalogSeedService,
      studioElements as unknown as StudioElementSeedService,
      studioPresets as unknown as StudioPresetSeedService,
    );
  });

  it('logs one summary line per domain and reports no failures', async () => {
    const report = await service.reconcile();
    expect(report.failedDomains).toEqual([]);
    expect(logger.log).toHaveBeenCalledWith(
      'reference-data models: written=1 unchanged=3 failed=0',
      'ReferenceDataSyncService',
    );
    expect(logger.log).toHaveBeenCalledWith(
      'reference-data platform-templates: written=1 unchanged=3 failed=0',
      'ReferenceDataSyncService',
    );
    expect(skills.backfillOrganizations).toHaveBeenCalledOnce();
  });

  it('attempts remaining domains after one fails and names the failed domain', async () => {
    models.reconcileCatalog.mockRejectedValue(
      new Error('Model catalog reconcile failed for: broken/key'),
    );

    const report = await service.reconcile();

    expect(report.failedDomains).toEqual(['models']);
    expect(studioPresets.reconcileCatalog).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      'Reference-data domain failed: models (broken/key)',
      expect.any(Error),
      'ReferenceDataSyncService',
    );
  });
});
