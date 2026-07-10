import {
  type CreatePatternDto,
  PatternStoreService,
} from '@api/collections/content-intelligence/services/pattern-store.service';
import {
  ContentIntelligencePlatform,
  ContentPatternType,
} from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMocks() {
  const contentPattern = {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };

  return {
    logger: {
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
