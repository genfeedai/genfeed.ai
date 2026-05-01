import { TagsController } from '@api/collections/tags/controllers/tags.controller';
import type { TagsQueryDto } from '@api/collections/tags/dto/tags-query.dto';
import { TagsService } from '@api/collections/tags/services/tags.service';
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

  const userId = '507f191e810c19729de860ee'.toString();
  const orgId = '507f191e810c19729de860ee'.toString();
  const brandId = '507f191e810c19729de860ee'.toString();

  const mockUser = {
    id: 'clerk_user_123',
    publicMetadata: { brand: brandId, organization: orgId, user: userId },
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
    };

    controller = new TagsController(
      tagsService as unknown as TagsService,
      mockLogger as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should populate organization and brand fields (user excluded from populate)', () => {
    expect(controller.optimizedPopulateFields).toHaveLength(2);
  });

  describe('buildFindAllQuery', () => {
    it('should include global tags OR conditions', () => {
      const query = { isDeleted: false } as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, query);

      expect(query).toBeInstanceOf(Array);
      expect(query.length).toBeGreaterThanOrEqual(2); // match + orderBy

      const matchStage = query[0] as Record<string, Record<string, unknown>>;
      expect(matchStage.match.OR).toBeDefined();
    });

    it('should filter by category when provided', () => {
      const query = {
        category: 'hashtag',
        isDeleted: false,
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, query);

      const matchStage = query[0] as Record<string, Record<string, unknown>>;
      expect(matchStage.match.category).toBe('hashtag');
    });

    it('should filter by brand when provided', () => {
      const query = {
        brand: brandId,
        isDeleted: false,
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, query);

      const matchStage = query[0] as Record<string, Record<string, unknown>>;
      expect(matchStage.match.brand).toEqual(expect.any(String));
    });

    it('should add search condition with AND when search is provided', () => {
      const query = {
        isDeleted: false,
        search: 'trending',
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, query);

      const matchStage = query[0] as Record<string, Record<string, unknown>>;
      expect(matchStage.match.AND).toBeDefined();
    });

    it('should use label filter when search is not provided but label is', () => {
      const query = {
        isDeleted: false,
        label: 'test',
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, query);

      const matchStage = query[0] as Record<string, Record<string, unknown>>;
      expect(matchStage.match.label).toBeDefined();
      expect(matchStage.match.AND).toBeUndefined();
    });

    it('should prefer search over label when both are provided', () => {
      const query = {
        isDeleted: false,
        label: 'specific',
        search: 'general',
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, query);

      const matchStage = query[0] as Record<string, Record<string, unknown>>;
      expect(matchStage.match.AND).toBeDefined();
      expect(matchStage.match.label).toBeUndefined();
    });
  });

  describe('enrichCreateDto', () => {
    it('should create a global tag when user is explicitly null', () => {
      const dto = { key: 'global-tag', label: 'Global', user: null };
      const result = controller.enrichCreateDto(dto, mockUser);

      expect(result.user).toBeNull();
      expect(result.organization).toBeNull();
      expect(result.brand).toBeNull();
    });

    it('should enrich with user context for normal tags', () => {
      const dto = { key: 'my-tag', label: 'My Tag' };
      const result = controller.enrichCreateDto(dto, mockUser);

      // enrichCreateDto from BaseCRUDController adds user context
      expect(result).toHaveProperty('label', 'My Tag');
    });
  });
});
