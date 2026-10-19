import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { scopedWhere } from '@api/index';
import { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/index', () => ({
  scopedWhere: vi.fn((organizationId: string, where: object) => ({
    isDeleted: false,
    ...where,
    organizationId,
  })),
}));

describe('CreativePatternsService', () => {
  const prisma = {
    creativePattern: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'));
    prisma.creativePattern.count.mockReset();
    prisma.creativePattern.count.mockResolvedValue(0);
    prisma.creativePattern.findMany.mockReset();
    prisma.creativePattern.findMany.mockResolvedValue([]);
    vi.mocked(scopedWhere).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('findAll', () => {
    const notExpired = {
      OR: [
        { data: { equals: Prisma.AnyNull, path: ['validUntil'] } },
        {
          data: {
            gte: '2026-10-19T12:00:00.000Z',
            path: ['validUntil'],
          },
        },
      ],
    };

    it('pages in the database, scoped to the organization', async () => {
      const service = new CreativePatternsService(prisma as never);

      await service.findAll(
        { organizationId: 'org-1' },
        { limit: 15, page: 3 },
      );

      const expectedWhere = {
        AND: [notExpired],
        isDeleted: false,
        organizationId: 'org-1',
      };
      expect(scopedWhere).toHaveBeenCalledWith('org-1', {
        AND: [notExpired],
      });
      expect(prisma.creativePattern.findMany).toHaveBeenCalledWith({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: 30,
        take: 15,
        where: expectedWhere,
      });
      expect(prisma.creativePattern.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it('applies brand and JSON filters in the query, not in memory', async () => {
      const service = new CreativePatternsService(prisma as never);

      await service.findAll(
        {
          brandId: 'brand-1',
          organizationId: 'org-1',
          patternType: 'hook_formula',
          platform: 'instagram',
          scope: 'private',
        },
        { limit: 20, page: 1 },
      );

      const expectedWhere = {
        AND: [
          { data: { equals: 'instagram', path: ['platform'] } },
          { data: { equals: 'hook_formula', path: ['patternType'] } },
          { data: { equals: 'private', path: ['scope'] } },
          notExpired,
        ],
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
      };
      expect(prisma.creativePattern.findMany).toHaveBeenCalledWith({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 20,
        where: expectedWhere,
      });
      expect(prisma.creativePattern.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it('returns the page envelope with normalized documents', async () => {
      const service = new CreativePatternsService(prisma as never);
      prisma.creativePattern.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          data: { avgPerformanceScore: 7, label: 'Hook' },
          id: 'pattern-1',
          organizationId: 'org-1',
        },
      ]);
      prisma.creativePattern.count.mockResolvedValue(31);

      const result = await service.findAll(
        { organizationId: 'org-1' },
        { limit: 15, page: 2 },
      );

      expect(result).toMatchObject({
        hasNextPage: true,
        hasPrevPage: true,
        limit: 15,
        page: 2,
        totalDocs: 31,
        totalPages: 3,
      });
      expect(result.docs).toEqual([
        expect.objectContaining({
          avgPerformanceScore: 7,
          brand: 'brand-1',
          id: 'pattern-1',
          label: 'Hook',
          organization: 'org-1',
        }),
      ]);
    });
  });

  describe('findRanked', () => {
    it('scopes the window to the session organization', async () => {
      const service = new CreativePatternsService(prisma as never);

      await service.findRanked({ organizationId: 'org-1' });

      expect(scopedWhere).toHaveBeenCalledWith('org-1', {});
      expect(prisma.creativePattern.findMany).toHaveBeenCalledWith({
        orderBy: { updatedAt: 'desc' },
        take: 500,
        where: {
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('applies brand and JSON filters before loading patterns', async () => {
      const service = new CreativePatternsService(prisma as never);

      await service.findRanked({
        brandId: 'brand-1',
        organizationId: 'org-1',
        patternType: 'hook_formula',
        platform: 'instagram',
        scope: 'private',
      });

      expect(prisma.creativePattern.findMany).toHaveBeenCalledWith({
        orderBy: { updatedAt: 'desc' },
        take: 500,
        where: {
          AND: [
            { data: { equals: 'instagram', path: ['platform'] } },
            { data: { equals: 'hook_formula', path: ['patternType'] } },
            { data: { equals: 'private', path: ['scope'] } },
          ],
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('ranks by score, drops expired rows and caps the rows returned', async () => {
      const service = new CreativePatternsService(prisma as never);
      prisma.creativePattern.findMany.mockResolvedValue(
        [
          { score: 1 },
          { score: 9 },
          { score: 5 },
          { score: 7 },
          { score: 99, validUntil: '2020-01-01T00:00:00.000Z' },
        ].map(({ score, validUntil }, index) => ({
          brandId: null,
          data: { avgPerformanceScore: score, validUntil },
          id: `pattern-${index}`,
          organizationId: 'org-1',
        })),
      );

      const top = await service.findRanked({
        limit: 2,
        organizationId: 'org-1',
      });
      const listed = await service.findRanked({
        limit: 1000,
        organizationId: 'org-1',
      });

      expect(top.map((pattern) => pattern.avgPerformanceScore)).toEqual([9, 7]);
      expect(listed.map((pattern) => pattern.avgPerformanceScore)).toEqual([
        9, 7, 5, 1,
      ]);
    });
  });

  describe('findTopForBrand', () => {
    it('reads brand patterns alongside the org-wide ones', async () => {
      const service = new CreativePatternsService(prisma as never);

      await service.findTopForBrand('org-1', 'brand-1', {
        patternTypes: ['hook_formula'],
      });

      expect(prisma.creativePattern.findMany).toHaveBeenCalledWith({
        orderBy: { updatedAt: 'desc' },
        take: 500,
        where: {
          AND: [
            {
              OR: [
                { data: { equals: 'public', path: ['scope'] } },
                { data: { equals: 'private', path: ['scope'] } },
              ],
            },
            {
              OR: [{ data: { equals: 'hook_formula', path: ['patternType'] } }],
            },
          ],
          // Patterns learned without a brand belong to the whole organization,
          // so brand guidance reads them next to the brand's own patterns.
          OR: [{ brandId: 'brand-1' }, { brandId: null }],
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });
  });
});
