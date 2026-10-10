import { StudioPresetSeedService } from '@api/seeds/studio-preset-seed.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  STUDIO_SYSTEM_PRESETS,
  studioSystemPresetId,
} from '@genfeedai/contracts/constants/studio-system-presets.constant';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const prisma = {
    preset: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  const logger = { error: vi.fn() };
  return {
    prisma,
    logger,
    service: new StudioPresetSeedService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
    ),
  };
}
describe('StudioPresetSeedService', () => {
  it('seeds six platform templates using deterministic IDs and preserves operator activation/soft deletion on repeat', async () => {
    const { prisma, service } = fixture();
    expect(await service.reconcileCatalog()).toBe(6);
    expect(await service.reconcileCatalog()).toBe(6);
    for (const [index, preset] of STUDIO_SYSTEM_PRESETS.entries()) {
      const first = prisma.preset.upsert.mock.calls[index][0];
      expect(first.where).toEqual({
        id: studioSystemPresetId(preset.key),
        organizationId: null,
        brandId: null,
      });
      expect(first.create).toMatchObject({
        organizationId: null,
        brandId: null,
        isActive: true,
        config: {
          key: preset.key,
          promptTemplate: preset.values.promptTemplate,
        },
      });
      expect(first.update).not.toHaveProperty('isActive');
      expect(first.update).not.toHaveProperty('isDeleted');
      expect(first.update).toEqual({});
      expect(prisma.preset.upsert.mock.calls[index + 6][0].where).toEqual(
        first.where,
      );
    }
  });
  it('does not overwrite a tenant or brand-owned row with a colliding ID', async () => {
    const { prisma, service } = fixture();
    prisma.preset.findUnique.mockResolvedValue({
      organizationId: 'other-org',
      brandId: 'other-brand',
    });
    expect(await service.reconcileCatalog()).toBe(0);
    expect(prisma.preset.upsert).not.toHaveBeenCalled();
  });
  it('reports seed failures without preventing application bootstrap', async () => {
    const { prisma, logger, service } = fixture();
    prisma.preset.upsert.mockRejectedValue(new Error('DB unavailable'));
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
