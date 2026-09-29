import { TagsController } from '@api/collections/tags/controllers/tags.controller';
import type { TagsQueryDto } from '@api/collections/tags/dto/tags-query.dto';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';

describe('TagsController', () => {
  let controller: TagsController;
  let tagsService: Record<string, ReturnType<typeof vi.fn>>;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const userId = testId('user');
  const orgId = testId('org');
  const brandId = testId('brand');

  const mockUser = {
    id: 'authProvider_user_123',
    brandId: brandId,
    organizationId: orgId,
    userId: userId,
  } as never;

  beforeEach(() => {
    tagsService = {
      create: vi.fn(),
      findAll: vi.fn().mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 1,
      }),
      findOne: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
      supportsField: vi.fn((field: string) =>
        ['brandId', 'organizationId', 'userId'].includes(field),
      ),
    };

    controller = new TagsController(
      tagsService as unknown as TagsService,
      mockLogger as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('buildFindAllQuery', () => {
    it('should include global tags OR conditions', () => {
      const inputQuery = { isDeleted: false } as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query).toHaveProperty('orderBy');
      expect(query.where.OR).toBeDefined();
    });

    it('should filter by category when provided', () => {
      const inputQuery = {
        category: 'hashtag',
        isDeleted: false,
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query.where.category).toBe('hashtag');
    });

    it('should filter by brand when provided', () => {
      const inputQuery = {
        brandId,
        isDeleted: false,
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query.where.brandId).toBe(brandId);
    });

    it('should not include category in search OR conditions (enum field does not support contains)', () => {
      const inputQuery = {
        isDeleted: false,
        search: 'trending',
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      const andBlock = query.where.AND as Array<{
        OR: Array<Record<string, unknown>>;
      }>;
      const searchOrFields = andBlock[0].OR.map(
        (entry) => Object.keys(entry)[0],
      );
      expect(searchOrFields).not.toContain('category');
      expect(searchOrFields).toEqual(
        expect.arrayContaining(['label', 'key', 'description']),
      );
    });

    it('should use label filter when search is not provided but label is', () => {
      const inputQuery = {
        isDeleted: false,
        label: 'test',
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query.where.label).toBeDefined();
      expect(query.where.AND).toBeUndefined();
    });
  });

  describe('enrichCreateDto', () => {
    it('should enrich new tags with canonical ownership fields', () => {
      const dto = { key: 'my-tag', label: 'My Tag' };
      const result = controller.enrichCreateDto(dto, mockUser);

      expect(result).toMatchObject({
        brandId,
        key: 'my-tag',
        label: 'My Tag',
        organizationId: orgId,
        userId,
      });
      expect(result).not.toHaveProperty('brand');
      expect(result).not.toHaveProperty('organization');
      expect(result).not.toHaveProperty('user');
    });
  });
});
