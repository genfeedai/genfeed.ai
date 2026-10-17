import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSeedArticles, mockSeedWorkflows } = vi.hoisted(() => ({
  mockSeedArticles: vi.fn(),
  mockSeedWorkflows: vi.fn(),
}));

vi.mock('@api-scripts/seeds/articles.seed', () => ({
  seedArticles: mockSeedArticles,
}));
vi.mock('@api-scripts/seeds/workflows.seed', () => ({
  seedWorkflows: mockSeedWorkflows,
}));

const { AdminSeedsService } = await import('./seeds.service');

function build() {
  const prisma = {} as never;
  const cache = { invalidateByTags: vi.fn().mockResolvedValue(2) };
  return {
    cache,
    prisma,
    service: new AdminSeedsService(prisma, cache as never),
  };
}

describe('AdminSeedsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeedArticles.mockResolvedValue({
      created: 3,
      dryRun: true,
      owner: { brandId: 'brand-1', organizationId: 'org-1' },
      refreshed: 1,
    });
    mockSeedWorkflows.mockResolvedValue({
      dryRun: true,
      skipped: 0,
      unchanged: 4,
      updated: 2,
    });
  });

  describe('seedArticles', () => {
    it('defaults to a dry run and needs no owner for it', async () => {
      const { prisma, service } = build();

      await expect(service.seedArticles({})).resolves.toEqual({
        brandId: 'brand-1',
        created: 3,
        dryRun: true,
        organizationId: 'org-1',
        refreshed: 1,
      });

      expect(mockSeedArticles).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ dryRun: true }),
        expect.any(Object),
      );
    });

    it('refuses a live run that does not name its owner', async () => {
      const { service } = build();

      await expect(
        service.seedArticles({ brandSlug: 'genfeed', dryRun: false }),
      ).rejects.toThrow('must name its owner');
      expect(mockSeedArticles).not.toHaveBeenCalled();
    });

    it('refuses a live run that does not name its review brand', async () => {
      const { service } = build();

      await expect(
        service.seedArticles({ dryRun: false, ownerEmail: 'a@b.co' }),
      ).rejects.toThrow('must name its review brand');
      expect(mockSeedArticles).not.toHaveBeenCalled();
    });

    it('runs live for a named owner and brand and drops the public article cache', async () => {
      const { cache, service } = build();
      mockSeedArticles.mockImplementationOnce(
        async (
          _prisma: unknown,
          _options: unknown,
          hooks: { invalidateCache: () => Promise<void> },
        ) => {
          await hooks.invalidateCache();
          return {
            created: 1,
            dryRun: false,
            owner: { brandId: 'brand-1', organizationId: 'org-1' },
            refreshed: 0,
          };
        },
      );

      const result = await service.seedArticles({
        brandSlug: 'genfeed',
        dryRun: false,
        ownerEmail: 'owner@genfeed.ai',
      });

      expect(result.dryRun).toBe(false);
      expect(cache.invalidateByTags).toHaveBeenCalledWith([
        'articles',
        'public',
      ]);
    });

    it('reports a seed failure as a bad request', async () => {
      const { service } = build();
      mockSeedArticles.mockRejectedValueOnce(
        new Error('No active user found for email x'),
      );

      await expect(
        service.seedArticles({ ownerEmail: 'x@y.co' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('seedWorkflows', () => {
    it('defaults to a dry run across every brand', async () => {
      const { service } = build();

      await expect(service.seedWorkflows({})).resolves.toMatchObject({
        dryRun: true,
        unchanged: 4,
        updated: 2,
      });
      expect(mockSeedWorkflows).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: true }),
      );
    });

    it('refuses a live run that is not narrowed or explicitly global', async () => {
      const { service } = build();

      await expect(service.seedWorkflows({ dryRun: false })).rejects.toThrow(
        'allBrands',
      );
      expect(mockSeedWorkflows).not.toHaveBeenCalled();
    });

    it.each([
      { brandId: 'brand-1' },
      { organizationId: 'org-1' },
      { allBrands: true },
    ])('allows a live run with %o', async (scope) => {
      const { service } = build();

      await service.seedWorkflows({ dryRun: false, ...scope });

      expect(mockSeedWorkflows).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: false }),
      );
    });
  });
});
