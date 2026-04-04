import { ImagesService } from '@services/ingredients/images.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock serializers to avoid complex build chain
vi.mock('@genfeedai/client/serializers', () => ({
  AvatarSerializer: { serialize: vi.fn((data) => data) },
  ImageEditSerializer: { serialize: vi.fn((data) => data) },
  ImageSerializer: { serialize: vi.fn((data) => data) },
  IngredientBulkDeleteSerializer: { serialize: vi.fn((data) => data) },
  IngredientSerializer: { serialize: vi.fn((data) => data) },
  MetadataSerializer: { serialize: vi.fn((data) => data) },
  MusicSerializer: { serialize: vi.fn((data) => data) },
  VideoSerializer: { serialize: vi.fn((data) => data) },
}));

// Use hoisted to ensure these are available in factory functions
const { mockGet, mockPost, mockPatch, mockDelete } = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('@services/core/base.service', () => {
  const mockInstance = {
    delete: mockDelete,
    get: mockGet,
    patch: mockPatch,
    post: mockPost,
  };

  class MockBaseService {
    public instance = mockInstance;
    public endpoint: string;
    public token: string;

    constructor(endpoint: string, token: string, ..._rest: unknown[]) {
      this.endpoint = endpoint;
      this.token = token;
    }

    async findAll(_params?: unknown) {
      return [];
    }
    async findOne(_id: string) {
      return {};
    }
    async post(_data: unknown) {
      return {};
    }
    async patch(_id: string, _data: unknown) {
      return {};
    }
    async delete(_id: string) {
      return undefined;
    }
    mapOne(res: { data: unknown }) {
      return res.data;
    }

    static getInstance(this: unknown, token: string) {
      return new (MockBaseService as new (token: string) => unknown)(token);
    }
  }

  return { BaseService: MockBaseService };
});

// Mock IngredientsService which ImagesService extends
vi.mock('@services/content/ingredients.service', () => {
  const mockInstance = {
    delete: mockDelete,
    get: mockGet,
    patch: mockPatch,
    post: mockPost,
  };

  class MockIngredientsService {
    public instance = mockInstance;
    public endpoint: string;
    public token: string;

    constructor(endpoint: string, token: string, ..._rest: unknown[]) {
      this.endpoint = endpoint;
      this.token = token;
    }

    async findAll(_params?: unknown) {
      return [];
    }
    async findOne(_id: string) {
      return {};
    }
    async post(_data: unknown) {
      return {};
    }
    async patch(_id: string, _data: unknown) {
      return {};
    }
    async delete(_id: string) {
      return undefined;
    }
    mapOne(res: { data: unknown }) {
      return res.data;
    }

    static getInstance(this: unknown, token: string) {
      return new (MockIngredientsService as new (token: string) => unknown)(
        token,
      );
    }
  }

  return { IngredientsService: MockIngredientsService };
});

describe('ImagesService', () => {
  let service: ImagesService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    ImagesService.imageInstances = new Map();
    service = new ImagesService(mockToken);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(ImagesService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });

  describe('getInstance', () => {
    it('returns an ImagesService instance', () => {
      const instance = ImagesService.getInstance(mockToken);
      expect(instance).toBeInstanceOf(ImagesService);
    });

    it('returns the same instance for the same token', () => {
      const instance1 = ImagesService.getInstance(mockToken);
      const instance2 = ImagesService.getInstance(mockToken);
      expect(instance1).toBe(instance2);
    });

    it('returns different instances for different tokens', () => {
      const instance1 = ImagesService.getInstance('token-a');
      const instance2 = ImagesService.getInstance('token-b');
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('post', () => {
    it('serializes body and posts to root endpoint', async () => {
      const imageData = { url: 'https://example.com/image.jpg' };
      mockPost.mockResolvedValue({ data: { data: { id: 'img-1' } } });

      await service.post(imageData);

      expect(mockPost).toHaveBeenCalledWith('', imageData);
    });

    it('returns mapped image result', async () => {
      const mockImage = { id: 'img-1', url: 'https://example.com/img.jpg' };
      mockPost.mockResolvedValue({ data: { data: mockImage } });

      const result = await service.post({ url: 'https://example.com/img.jpg' });
      expect(result).toBeDefined();
    });
  });

  describe('postUpscale', () => {
    it('posts to /:id/upscale endpoint', async () => {
      const imageId = 'img-123';
      const params = { scale: 2 };
      mockPost.mockResolvedValue({ data: { data: {} } });

      await service.postUpscale(imageId, params as never);

      expect(mockPost).toHaveBeenCalledWith(`/${imageId}/upscale`, params);
    });
  });

  describe('postReframe', () => {
    it('posts to /:id/reframe endpoint', async () => {
      const imageId = 'img-456';
      const params = { ratio: '16:9' };
      mockPost.mockResolvedValue({ data: { data: {} } });

      await service.postReframe(imageId, params as never);

      expect(mockPost).toHaveBeenCalledWith(`/${imageId}/reframe`, params);
    });
  });
});
