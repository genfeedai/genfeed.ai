import {
  type CreatePatternDto,
  PatternStoreService,
} from '@api/collections/content-intelligence/services/pattern-store.service';
import {
  ContentIntelligencePlatform,
  ContentPatternType,
} from '@genfeedai/contracts';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  assertTenantScopedQuery,
  TenantIsolationError,
} from '@libs/prisma/tenant-guard';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMocks() {
  const contentPattern = {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };

  return {
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
    prisma: { contentPattern },
  };
}

describe('PatternStoreService organization scoping', () => {
  let service: PatternStoreService;
  let mocks: ReturnType<typeof createMocks>;

  const organizationId = 'org-123';
  const creatorId = 'creator-1';

  beforeEach(() => {
    mocks = createMocks();
    service = new PatternStoreService(
      mocks.prisma as never,
      mocks.logger as never,
    );
  });

  describe('findByCreator', () => {
    it('should scope the lookup to the organization and creator', async () => {
      mocks.prisma.contentPattern.findMany.mockResolvedValue([]);

      await service.findByCreator(creatorId, organizationId);

      expect(mocks.prisma.contentPattern.findMany).toHaveBeenCalledWith({
        where: { isDeleted: false, organizationId, sourceCreatorId: creatorId },
      });
    });

    it('should not match a foreign organization', async () => {
      // A creator that belongs to another org yields no rows because the
      // organization filter is part of the where clause.
      mocks.prisma.contentPattern.findMany.mockResolvedValue([]);

      const result = await service.findByCreator(creatorId, 'other-org');

      expect(result).toEqual([]);
      expect(mocks.prisma.contentPattern.findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          organizationId: 'other-org',
          sourceCreatorId: creatorId,
        },
      });
    });
  });

  describe('incrementUsage', () => {
    const patternId = 'pattern-1';

    function guardAll(): void {
      const guard = (operation: string) => (args: unknown) =>
        assertTenantScopedQuery({
          args,
          isCloud: true,
          model: 'ContentPattern',
          operation,
          tenantModelNames: new Set(['ContentPattern']),
        });
      const checkFindFirst = guard('findFirst');
      const checkUpdate = guard('update');
      mocks.prisma.contentPattern.findFirst.mockImplementation(
        async (args: unknown) => {
          checkFindFirst(args);
          return { data: { usageCount: 2 }, id: patternId, organizationId };
        },
      );
      mocks.prisma.contentPattern.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => {
          checkUpdate(args);
          return { id: patternId, organizationId, ...args.data };
        },
      );
    }

    it('scopes the lookup and the write to the organization under the CLOUD tenant guard', async () => {
      guardAll();

      await runWithTenantContext({ organizationId }, () =>
        service.incrementUsage(patternId, organizationId),
      );

      expect(mocks.prisma.contentPattern.findFirst).toHaveBeenCalledWith({
        where: { id: patternId, isDeleted: false, organizationId },
      });
      expect(mocks.prisma.contentPattern.update).toHaveBeenCalledWith({
        data: { data: { usageCount: 3 } },
        where: { id: patternId, isDeleted: false, organizationId },
      });
    });

    it('refuses an organization other than the request tenant', async () => {
      guardAll();

      await expect(
        runWithTenantContext({ organizationId: 'org-other' }, () =>
          service.incrementUsage(patternId, organizationId),
        ),
      ).rejects.toBeInstanceOf(TenantIsolationError);
      expect(mocks.prisma.contentPattern.update).not.toHaveBeenCalled();
    });

    it('does nothing when the pattern is not visible to the organization', async () => {
      mocks.prisma.contentPattern.findFirst.mockResolvedValue(null);

      await service.incrementUsage(patternId, organizationId);

      expect(mocks.prisma.contentPattern.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteByCreator', () => {
    it('should scope the soft-delete to the organization and creator', async () => {
      mocks.prisma.contentPattern.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.deleteByCreator(creatorId, organizationId);

      expect(mocks.prisma.contentPattern.updateMany).toHaveBeenCalledWith({
        where: { isDeleted: false, organizationId, sourceCreatorId: creatorId },
        data: { isDeleted: true },
      });
      expect(result).toEqual({ count: 3 });
    });
  });

  describe('storeBulkPatterns', () => {
    it('should persist each pattern via storePattern', async () => {
      const storePattern = vi
        .spyOn(service, 'storePattern')
        .mockImplementation(async (dto) => ({ id: dto.rawExample }) as never);

      const patterns = [
        buildPattern('a'),
        buildPattern('b'),
        buildPattern('c'),
      ];

      const result = await service.storeBulkPatterns(patterns);

      expect(storePattern).toHaveBeenCalledTimes(3);
      expect(result).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    });
  });

  it('persists scalar ownership separately from pattern JSON data', async () => {
    mocks.prisma.contentPattern.create.mockImplementation(async ({ data }) => ({
      createdAt: new Date(),
      id: 'pattern-1',
      isDeleted: false,
      updatedAt: new Date(),
      ...data,
    }));

    await service.storePattern({
      ...buildPattern('example'),
      sourceCreatorId: creatorId,
    });

    expect(mocks.prisma.contentPattern.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        data: expect.objectContaining({
          patternType: ContentPatternType.HOOK,
          rawExample: 'example',
          relevanceWeight: 1,
          usageCount: 0,
        }),
        organizationId,
        sourceCreatorId: creatorId,
      }),
    });
  });

  it('filters JSON domain fields through Prisma JSON paths', async () => {
    mocks.prisma.contentPattern.findMany.mockResolvedValue([]);

    await service.findByOrganization(organizationId, {
      minEngagementRate: 2,
      patternType: ContentPatternType.HOOK,
    });

    expect(mocks.prisma.contentPattern.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'desc' }],
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          { data: { equals: ContentPatternType.HOOK, path: ['patternType'] } },
          {
            data: {
              gte: 2,
              path: ['sourceMetrics', 'engagementRate'],
            },
          },
        ]),
        organizationId,
      }),
    });
  });

  function buildPattern(rawExample: string): CreatePatternDto {
    return {
      extractedFormula: 'formula',
      organizationId,
      patternType: ContentPatternType.HOOK,
      placeholders: [],
      platform: ContentIntelligencePlatform.INSTAGRAM,
      rawExample,
      sourceMetrics: {
        comments: 0,
        engagementRate: 0,
        likes: 0,
        shares: 0,
        views: 0,
        viralScore: 0,
      },
      tags: [],
    };
  }
});
