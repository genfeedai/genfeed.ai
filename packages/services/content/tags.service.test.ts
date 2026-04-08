import { API_ENDPOINTS } from '@genfeedai/constants';
import { TagCategory } from '@genfeedai/enums';
import type { ITag } from '@genfeedai/interfaces';
import { TagSerializer } from '@genfeedai/serializers';
import { Tag } from '@models/content/tag.model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('@services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock BaseService
const mockInstance = {
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
};

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    public endpoint: string;
    public token: string;
    public ModelClass: typeof Tag;
    public Serializer: typeof TagSerializer;
    public instance = mockInstance;

    constructor(
      endpoint: string,
      token: string,
      ModelClass: typeof Tag,
      Serializer: typeof TagSerializer,
    ) {
      this.endpoint = endpoint;
      this.token = token;
      this.ModelClass = ModelClass;
      this.Serializer = Serializer;
    }

    static getInstance(token: string): MockBaseService {
      return new MockBaseService(API_ENDPOINTS.TAGS, token, Tag, TagSerializer);
    }
  }

  return { BaseService: MockBaseService };
});

// Mock TagSerializer
vi.mock('@genfeedai/serializers', () => ({
  TagSerializer: {
    deserialize: vi.fn((data: ITag) => data),
    serialize: vi.fn((data: Partial<ITag>) => ({ data })),
  },
}));

import { TagsService } from '@services/content/tags.service';
import { logger } from '@services/core/logger.service';

describe('TagsService', () => {
  const mockToken = 'test-token';
  let service: TagsService;

  const mockTagData: ITag = {
    category: TagCategory.STYLE,
    createdAt: new Date().toISOString(),
    id: 'tag-123',
    label: 'Test Tag',
    updatedAt: new Date().toISOString(),
  };

  const mockTagsData: ITag[] = [
    { category: TagCategory.STYLE, id: 'tag-1', label: 'Tag 1' },
    { category: TagCategory.STYLE, id: 'tag-2', label: 'Tag 2' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TagsService(mockToken);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct endpoint', () => {
      expect((service as any).endpoint).toBe(API_ENDPOINTS.TAGS);
    });

    it('should initialize with provided token', () => {
      expect((service as any).token).toBe(mockToken);
    });
  });

  describe('getInstance', () => {
    it('should return TagsService instance', () => {
      const instance = TagsService.getInstance(mockToken);

      expect(instance).toBeDefined();
    });
  });

  describe('getTagsForCategory', () => {
    it('should get tags for a specific category', async () => {
      mockInstance.get.mockResolvedValue({ data: mockTagsData });

      const result = await service.getTagsForCategory(TagCategory.STYLE);

      expect(mockInstance.get).toHaveBeenCalledWith('', {
        params: { category: TagCategory.STYLE },
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Tag);
    });

    it('should log success message', async () => {
      mockInstance.get.mockResolvedValue({ data: mockTagsData });

      await service.getTagsForCategory(TagCategory.MOOD);

      expect(logger.info).toHaveBeenCalledWith(
        `GET /tags?category=${TagCategory.MOOD} success`,
        expect.any(Array),
      );
    });

    it('should log error and throw on failure', async () => {
      const error = new Error('Network error');
      mockInstance.get.mockRejectedValue(error);

      await expect(
        service.getTagsForCategory(TagCategory.STYLE),
      ).rejects.toThrow('Network error');
      expect(logger.error).toHaveBeenCalledWith(
        `GET /tags?category=${TagCategory.STYLE} failed`,
        error,
      );
    });
  });

  describe('addTagToEntity', () => {
    it('should create a new tag', async () => {
      mockInstance.post.mockResolvedValue({ data: mockTagData });

      const result = await service.addTagToEntity(
        TagCategory.STYLE,
        'entity-123',
        'New Tag',
      );

      expect(mockInstance.post).toHaveBeenCalledWith('', expect.any(Object));
      expect(result).toBeInstanceOf(Tag);
    });

    it('should serialize tag data before sending', async () => {
      mockInstance.post.mockResolvedValue({ data: mockTagData });

      await service.addTagToEntity(TagCategory.MOOD, 'entity-123', 'Mood Tag');

      expect(TagSerializer.serialize).toHaveBeenCalledWith({
        category: TagCategory.MOOD,
        label: 'Mood Tag',
      });
    });

    it('should log success message', async () => {
      mockInstance.post.mockResolvedValue({ data: mockTagData });

      await service.addTagToEntity(TagCategory.STYLE, 'entity-123', 'New Tag');

      expect(logger.info).toHaveBeenCalledWith(
        'POST /tags success',
        expect.any(Tag),
      );
    });

    it('should log error and throw on failure', async () => {
      const error = new Error('Create failed');
      mockInstance.post.mockRejectedValue(error);

      await expect(
        service.addTagToEntity(TagCategory.STYLE, 'entity-123', 'New Tag'),
      ).rejects.toThrow('Create failed');
      expect(logger.error).toHaveBeenCalledWith('POST /tags failed', error);
    });
  });

  describe('removeTag', () => {
    it('should delete a tag by id', async () => {
      mockInstance.delete.mockResolvedValue({});

      await service.removeTag('tag-123');

      expect(mockInstance.delete).toHaveBeenCalledWith('tag-123');
    });

    it('should log success message', async () => {
      mockInstance.delete.mockResolvedValue({});

      await service.removeTag('tag-456');

      expect(logger.info).toHaveBeenCalledWith('DELETE /tags/tag-456 success');
    });

    it('should log error and throw on failure', async () => {
      const error = new Error('Delete failed');
      mockInstance.delete.mockRejectedValue(error);

      await expect(service.removeTag('tag-123')).rejects.toThrow(
        'Delete failed',
      );
      expect(logger.error).toHaveBeenCalledWith(
        'DELETE /tags/tag-123 failed',
        error,
      );
    });
  });

  describe('updateTag', () => {
    it('should update tag label', async () => {
      mockInstance.patch.mockResolvedValue({ data: mockTagData });

      const result = await service.updateTag('tag-123', 'Updated Label');

      expect(mockInstance.patch).toHaveBeenCalledWith(
        'tag-123',
        expect.any(Object),
      );
      expect(result).toBeInstanceOf(Tag);
    });

    it('should serialize update data', async () => {
      mockInstance.patch.mockResolvedValue({ data: mockTagData });

      await service.updateTag('tag-123', 'New Label');

      expect(TagSerializer.serialize).toHaveBeenCalledWith({
        label: 'New Label',
      });
    });

    it('should log success message', async () => {
      mockInstance.patch.mockResolvedValue({ data: mockTagData });

      await service.updateTag('tag-789', 'Updated Label');

      expect(logger.info).toHaveBeenCalledWith(
        'PATCH /tags/tag-789 success',
        expect.any(Tag),
      );
    });

    it('should log error and throw on failure', async () => {
      const error = new Error('Update failed');
      mockInstance.patch.mockRejectedValue(error);

      await expect(service.updateTag('tag-123', 'Label')).rejects.toThrow(
        'Update failed',
      );
      expect(logger.error).toHaveBeenCalledWith(
        'PATCH /tags/tag-123 failed',
        error,
      );
    });
  });

  describe('searchTags', () => {
    it('should search tags by label', async () => {
      mockInstance.get.mockResolvedValue({ data: mockTagsData });

      const result = await service.searchTags('Test');

      expect(mockInstance.get).toHaveBeenCalledWith('', {
        params: { label: 'Test' },
      });
      expect(result).toHaveLength(2);
    });

    it('should include category filter when provided', async () => {
      mockInstance.get.mockResolvedValue({ data: mockTagsData });

      await service.searchTags('Test', TagCategory.STYLE);

      expect(mockInstance.get).toHaveBeenCalledWith('', {
        params: { category: TagCategory.STYLE, label: 'Test' },
      });
    });

    it('should handle non-array response', async () => {
      mockInstance.get.mockResolvedValue({ data: null });

      const result = await service.searchTags('Test');

      expect(result).toEqual([]);
    });

    it('should log success message', async () => {
      mockInstance.get.mockResolvedValue({ data: mockTagsData });

      await service.searchTags('Tag');

      expect(logger.info).toHaveBeenCalledWith(
        'GET /tags success',
        expect.any(Array),
      );
    });

    it('should log error and throw on failure', async () => {
      const error = new Error('Search failed');
      mockInstance.get.mockRejectedValue(error);

      await expect(service.searchTags('Test')).rejects.toThrow('Search failed');
      expect(logger.error).toHaveBeenCalledWith('GET /tags failed', error);
    });
  });
});
