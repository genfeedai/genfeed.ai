import { scopedWhere } from '@genfeedai/server';
import { CreativePatternsService } from '@server/collections/creative-patterns/creative-patterns.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/server', () => ({
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

  it('scopes top patterns to the requested brand', async () => {
    const service = new CreativePatternsService(prisma as never);

    await service.findTopForBrand('org-1', 'brand-1', {
      patternTypes: ['hook_formula'],
    });

    expect(prisma.creativePattern.findMany).toHaveBeenCalledWith({
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
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });
});
