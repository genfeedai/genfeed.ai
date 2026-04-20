import { TagsService } from '@api/collections/tags/services/tags.service';
import { TagResolutionService } from '@api/shared/services/tag-resolution/tag-resolution.service';
import type { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import { Test, TestingModule } from '@nestjs/testing';

describe('TagResolutionService', () => {
  let service: TagResolutionService;
  let tagsService: vi.Mocked<TagsService>;

  const mockTagId1 = '507f1f77bcf86cd799439011';
  const mockTagId2 = '507f1f77bcf86cd799439012';
  const mockTagId3 = '507f1f77bcf86cd799439013';

  const createFindAllResult = (
    docs: Array<{ _id: string; label: string | null }>,
  ) =>
    ({
      docs,
      hasNextPage: false,
      hasPrevPage: false,
      limit: docs.length,
      nextPage: null,
      page: 1,
      pagingCounter: 1,
      prevPage: null,
      totalDocs: docs.length,
      totalPages: 1,
    }) as unknown as AggregatePaginateResult<
      import('@api/collections/tags/schemas/tag.schema').TagDocument
    >;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagResolutionService,
        {
          provide: TagsService,
          useValue: {
            findAll: vi.fn(),
            findOne: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TagResolutionService>(TagResolutionService);
    tagsService = module.get(TagsService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveTagLabels', () => {
    it('should resolve tag IDs to labels', async () => {
      const tagIds = [mockTagId1, mockTagId2, mockTagId3];

      const mockTags = createFindAllResult([
        { _id: mockTagId1, label: 'Technology' },
        { _id: mockTagId2, label: 'AI' },
        { _id: mockTagId3, label: 'Tutorial' },
      ]);

      tagsService.findAll.mockResolvedValue(mockTags);

      const result = await service.resolveTagLabels(tagIds);

      expect(result).toEqual(['Technology', 'AI', 'Tutorial']);
      expect(tagsService.findAll).toHaveBeenCalledWith(
        [
          {
            $match: {
              _id: { $in: tagIds },
              isDeleted: false,
            },
          },
          {
            $project: {
              label: 1,
            },
          },
        ],
        {
          limit: tagIds.length,
          page: 1,
        },
      );
    });

    it('should return empty array for empty tag IDs', async () => {
      const result = await service.resolveTagLabels([]);

      expect(result).toEqual([]);
      expect(tagsService.findAll).not.toHaveBeenCalled();
    });

    it('should return empty array for null tag IDs', async () => {
      const result = await service.resolveTagLabels(
        null as unknown as string[],
      );

      expect(result).toEqual([]);
      expect(tagsService.findAll).not.toHaveBeenCalled();
    });

    it('should handle partial matches', async () => {
      const tagIds = [mockTagId1, mockTagId2, mockTagId3];

      const mockTags = createFindAllResult([
        { _id: mockTagId1, label: 'Technology' },
        // mockTagId2 not found
        { _id: mockTagId3, label: 'Tutorial' },
      ]);

      tagsService.findAll.mockResolvedValue(mockTags);

      const result = await service.resolveTagLabels(tagIds);

      expect(result).toEqual(['Technology', 'Tutorial']);
    });

    it('should handle single tag ID', async () => {
      const tagIds = [mockTagId1];

      const mockTags = createFindAllResult([
        { _id: mockTagId1, label: 'Technology' },
      ]);

      tagsService.findAll.mockResolvedValue(mockTags);

      const result = await service.resolveTagLabels(tagIds);

      expect(result).toEqual(['Technology']);
    });

    it('should handle errors from tagsService', async () => {
      const tagIds = [mockTagId1];
      const error = new Error('Database error');

      tagsService.findAll.mockRejectedValue(error);

      await expect(service.resolveTagLabels(tagIds)).rejects.toThrow(error);
    });
  });

  describe('resolveTagLabel', () => {
    it('should resolve single tag ID to label', async () => {
      const mockTag = {
        _id: mockTagId1,
        category: 'general',
        isActive: true,
        isDeleted: false,
        label: 'Technology',
      } as unknown as import('@api/collections/tags/schemas/tag.schema').TagDocument;

      tagsService.findOne.mockResolvedValue(mockTag);

      const result = await service.resolveTagLabel(mockTagId1);

      expect(result).toBe('Technology');
      expect(tagsService.findOne).toHaveBeenCalledWith({ _id: mockTagId1 });
    });

    it('should return null for non-existent tag', async () => {
      tagsService.findOne.mockResolvedValue(null);

      const result = await service.resolveTagLabel(mockTagId1);

      expect(result).toBeNull();
    });

    it('should return null for null tag ID', async () => {
      const result = await service.resolveTagLabel(null as unknown as string);

      expect(result).toBeNull();
      expect(tagsService.findOne).not.toHaveBeenCalled();
    });

    it('should return null for undefined tag ID', async () => {
      const result = await service.resolveTagLabel(
        undefined as unknown as string,
      );

      expect(result).toBeNull();
      expect(tagsService.findOne).not.toHaveBeenCalled();
    });

    it('should return null when tag exists but has no label', async () => {
      const mockTag = {
        _id: mockTagId1,
        category: 'general',
        isActive: true,
        isDeleted: false,
        label: null,
      } as unknown as import('@api/collections/tags/schemas/tag.schema').TagDocument;

      tagsService.findOne.mockResolvedValue(mockTag);

      const result = await service.resolveTagLabel(mockTagId1);

      expect(result).toBeNull();
    });

    it('should handle errors from tagsService', async () => {
      const error = new Error('Database error');

      tagsService.findOne.mockRejectedValue(error);

      await expect(service.resolveTagLabel(mockTagId1)).rejects.toThrow(error);
    });
  });
});
