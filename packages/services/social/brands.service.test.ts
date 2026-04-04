import { BrandsService } from '@services/social/brands.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

const mockInstance = {
  delete: mockDelete,
  get: mockGet,
  patch: mockPatch,
  post: mockPost,
};

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    public instance = mockInstance;
    public endpoint: string;
    public token: string;

    constructor(endpoint: string, token: string, ..._rest: unknown[]) {
      this.endpoint = endpoint;
      this.token = token;
    }

    async findAll() {
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
    mapMany(res: { data: unknown[] }) {
      return res.data;
    }

    static getInstance(this: unknown, token: string) {
      return new (MockBaseService as new (token: string) => unknown)(token);
    }
  }

  return { BaseService: MockBaseService };
});

vi.mock('@helpers/data/json-api/json-api.helper', () => ({
  deserializeCollection: vi.fn(<T>(doc: { data: T[] }) => doc.data),
  deserializeResource: vi.fn(<T>(doc: { data: T }) => doc.data),
}));

vi.mock('@services/content/pages.service', () => ({
  PagesService: {
    setCurrentPage: vi.fn(),
    setTotalDocs: vi.fn(),
    setTotalPages: vi.fn(),
  },
}));

describe('BrandsService', () => {
  let service: BrandsService;
  const mockToken = 'test-token-123';
  const mockBrandId = 'brand-456';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BrandsService(mockToken);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(BrandsService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });

  describe('findOneBySlug', () => {
    it('calls GET with slug param', async () => {
      const mockBrand = { id: 'b1', slug: 'testbrand' };
      mockGet.mockResolvedValue({ data: { data: mockBrand } });

      await service.findOneBySlug('testbrand');

      expect(mockGet).toHaveBeenCalledWith('slug', {
        params: { slug: 'testbrand' },
      });
    });

    it('returns mapped brand', async () => {
      const mockBrand = { id: 'b1', slug: 'mybrand' };
      mockGet.mockResolvedValue({ data: { data: mockBrand } });

      const result = await service.findOneBySlug('mybrand');
      expect(result).toBeDefined();
    });
  });

  describe('findBrandCredentials', () => {
    it('calls GET with correct endpoint', async () => {
      mockGet.mockResolvedValue({ data: { data: [] } });

      await service.findBrandCredentials(mockBrandId);

      expect(mockGet).toHaveBeenCalledWith(`${mockBrandId}/credentials`);
    });

    it('returns array of credentials', async () => {
      mockGet.mockResolvedValue({
        data: { data: [{ id: 'c1' }, { id: 'c2' }] },
      });

      const result = await service.findBrandCredentials(mockBrandId);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findBrandLinks', () => {
    it('calls GET with correct endpoint', async () => {
      mockGet.mockResolvedValue({ data: { data: [] } });

      await service.findBrandLinks(mockBrandId);

      expect(mockGet).toHaveBeenCalledWith(`/${mockBrandId}/links`);
    });
  });

  describe('findBrandActivities', () => {
    it('calls GET with correct endpoint', async () => {
      mockGet.mockResolvedValue({ data: { data: [], links: {} } });

      await service.findBrandActivities(mockBrandId);

      expect(mockGet).toHaveBeenCalledWith(
        `/${mockBrandId}/activities`,
        expect.any(Object),
      );
    });

    it('passes query params when provided', async () => {
      mockGet.mockResolvedValue({ data: { data: [], links: {} } });
      const query = { limit: 10, page: 1 };

      await service.findBrandActivities(mockBrandId, query as never);

      expect(mockGet).toHaveBeenCalledWith(`/${mockBrandId}/activities`, {
        params: query,
      });
    });
  });

  describe('findBrandPosts', () => {
    it('calls GET with correct endpoint', async () => {
      mockGet.mockResolvedValue({ data: { data: [], links: {} } });

      await service.findBrandPosts(mockBrandId);

      expect(mockGet).toHaveBeenCalledWith(
        `/${mockBrandId}/posts`,
        expect.any(Object),
      );
    });
  });

  describe('findBrandAnalytics', () => {
    it('calls GET with analytics endpoint', async () => {
      mockGet.mockResolvedValue({ data: { data: {} } });

      await service.findBrandAnalytics(mockBrandId);

      expect(mockGet).toHaveBeenCalledWith(`/${mockBrandId}/analytics`);
    });
  });

  describe('getInstance', () => {
    it('returns a BrandsService instance', () => {
      const instance = BrandsService.getInstance(mockToken);
      expect(instance).toBeInstanceOf(BrandsService);
    });
  });
});
