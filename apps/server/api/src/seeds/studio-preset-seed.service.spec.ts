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
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
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
  it('seeds six platform templates using deterministic IDs and skips writes on repeat', async () => {
    const { prisma, service } = fixture();
    expect(await service.reconcileCatalog()).toEqual({
      unchanged: 0,
      written: 6,
    });
    prisma.preset.findUnique.mockResolvedValue({
      organizationId: null,
      brandId: null,
    });
    expect(await service.reconcileCatalog()).toEqual({
      unchanged: 6,
      written: 0,
    });
    for (const [index, preset] of STUDIO_SYSTEM_PRESETS.entries()) {
      const first = prisma.preset.create.mock.calls[index][0];
      expect(first.data).toMatchObject({
        id: studioSystemPresetId(preset.key),
        organizationId: null,
        brandId: null,
        isActive: true,
        config: {
          key: preset.key,
          promptTemplate: preset.values.promptTemplate,
        },
      });
    }
    expect(prisma.preset.create).toHaveBeenCalledTimes(6);
  });
  it('does not overwrite a tenant or brand-owned row with a colliding ID', async () => {
    const { prisma, service } = fixture();
    prisma.preset.findUnique.mockResolvedValue({
      organizationId: 'other-org',
      brandId: 'other-brand',
    });
    expect(await service.reconcileCatalog()).toEqual({
      unchanged: 6,
      written: 0,
    });
    expect(prisma.preset.create).not.toHaveBeenCalled();
  });
  it('keeps seeding the other templates when one conflicts and fails closed', async () => {
    const { prisma, logger, service } = fixture();
    const [conflicting] = STUDIO_SYSTEM_PRESETS;
    prisma.preset.create.mockImplementation(
      async ({ data }: { data: { id: string } }) => {
        if (data.id === studioSystemPresetId(conflicting.key)) {
          throw Object.assign(new Error('Unique constraint failed'), {
            code: 'P2002',
          });
        }
        return {};
      },
    );

    await expect(service.reconcileCatalog()).rejects.toThrow(
      `Studio system preset reconcile failed for: ${conflicting.key}`,
    );

    expect(prisma.preset.create).toHaveBeenCalledTimes(
      STUDIO_SYSTEM_PRESETS.length,
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      `Studio system preset seed failed for ${conflicting.key}`,
      expect.any(Error),
      'StudioPresetSeedService',
    );
  });
});
