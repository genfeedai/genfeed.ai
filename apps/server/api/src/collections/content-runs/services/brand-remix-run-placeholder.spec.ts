import {
  bindPlaceholderToRemix,
  linkImportedSourceLineage,
} from '@api/collections/content-runs/services/brand-remix-run-placeholder';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { BrandRemixRunConfig } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('brand remix placeholder binding', () => {
  const ingredient = {
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = { ingredient } as unknown as PrismaService;

  function configFor(
    selector: BrandRemixRunConfig['sourceSnapshot']['selector'],
    media?: BrandRemixRunConfig['sourceSnapshot']['media'],
  ): BrandRemixRunConfig {
    return {
      sourceSnapshot: {
        capturedAt: '2026-08-20T10:00:00.000Z',
        evidence: ['hook'],
        media,
        metrics: {},
        pattern: {},
        platform: 'x',
        selector,
        sourceId: 'csource00000001',
        title: 'hook',
      },
    } as unknown as BrandRemixRunConfig;
  }

  const importedConfig = (
    media?: BrandRemixRunConfig['sourceSnapshot']['media'],
  ) =>
    configFor(
      { importedSourceId: 'csource00000001', kind: 'imported_source' },
      media,
    );

  const binding = (config: BrandRemixRunConfig) => ({
    brandId: 'brand-1',
    config,
    groupIndex: 1,
    ingredientId: 'generated-1',
    organizationId: 'org-1',
    recipeRevision: 3,
    runId: 'run-1',
  });

  beforeEach(() => {
    vi.resetAllMocks();
    ingredient.updateMany.mockResolvedValue({ count: 1 });
  });

  it('tags the run-scoped placeholder with the remix revision inside the tenant', async () => {
    await bindPlaceholderToRemix(
      prisma,
      binding(
        configFor({ kind: 'source_post', sourcePostId: 'source-post-1' }),
      ),
    );
    expect(ingredient.updateMany).toHaveBeenCalledWith({
      data: { templateVersion: 3 },
      where: {
        brandId: 'brand-1',
        groupId: 'run-1',
        groupIndex: 1,
        id: 'generated-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('refuses a placeholder it cannot bind before any lineage or dispatch', async () => {
    ingredient.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      bindPlaceholderToRemix(prisma, binding(importedConfig())),
    ).rejects.toThrow(/could not be bound/);
    expect(ingredient.findMany).not.toHaveBeenCalled();
    expect(ingredient.update).not.toHaveBeenCalled();
  });

  it('links a generated Library output to the saved source and its prepared media', async () => {
    ingredient.findMany.mockResolvedValue([
      { id: 'csource00000001' },
      { id: 'cmedia000000001' },
    ]);
    await bindPlaceholderToRemix(
      prisma,
      binding(
        importedConfig({
          assetId: 'cmedia000000001',
          category: 'image',
          purpose: 'analysis_only',
          status: 'saved',
        }),
      ),
    );
    expect(ingredient.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        brandId: 'brand-1',
        id: { in: ['csource00000001', 'cmedia000000001'] },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(ingredient.update).toHaveBeenCalledWith({
      data: {
        sources: {
          connect: [{ id: 'csource00000001' }, { id: 'cmedia000000001' }],
        },
      },
      where: {
        id: 'generated-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('stops before paid dispatch when the saved source is gone', async () => {
    ingredient.findMany.mockResolvedValue([]);
    await expect(
      linkImportedSourceLineage(prisma, binding(importedConfig())),
    ).rejects.toThrow(/no longer available/);
    expect(ingredient.update).not.toHaveBeenCalled();
  });

  it('leaves every other source kind untouched', async () => {
    await linkImportedSourceLineage(
      prisma,
      binding(
        configFor({ kind: 'source_post', sourcePostId: 'source-post-1' }),
      ),
    );
    expect(ingredient.findMany).not.toHaveBeenCalled();
    expect(ingredient.update).not.toHaveBeenCalled();
  });
});
