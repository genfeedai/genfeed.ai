import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { scopedWhere } from '@api/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/index', () => ({
  scopedWhere: vi.fn((organizationId: string, where: object) => ({
    isDeleted: false,
    ...where,
    organizationId,
  })),
}));

describe('CreativePatternsService.findAll', () => {
  const prisma = {
    creativePattern: {
      findMany: vi.fn(),
    },
  };

  beforeEach(() => {
    prisma.creativePattern.findMany.mockReset();
    prisma.creativePattern.findMany.mockResolvedValue([]);
    vi.mocked(scopedWhere).mockClear();
  });

  it('scopes the list to the session organization', async () => {
    const service = new CreativePatternsService(prisma as never);

    await service.findAll({ organizationId: 'org-1' });

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

    await service.findAll({
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

  it('caps the rows read and the rows returned, ranked by score', async () => {
    const service = new CreativePatternsService(prisma as never);
    prisma.creativePattern.findMany.mockResolvedValue(
      [1, 9, 5, 7].map((score, index) => ({
        brandId: null,
        data: { avgPerformanceScore: score },
        id: `pattern-${index}`,
        organizationId: 'org-1',
      })),
    );

    const top = await service.findAll({
      limit: 2,
      organizationId: 'org-1',
      top: true,
    });
    const listed = await service.findAll({
      limit: 1000,
      organizationId: 'org-1',
    });

    expect(top.map((pattern) => pattern.avgPerformanceScore)).toEqual([9, 7]);
    expect(listed).toHaveLength(4);
    expect(prisma.creativePattern.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });
});
