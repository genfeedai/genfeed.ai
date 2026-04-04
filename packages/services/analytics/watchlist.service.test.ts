import { WatchlistService } from '@services/analytics/watchlist.service';
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
    async mapOne(res: unknown) {
      return res;
    }

    static getInstance(this: unknown, token: string) {
      return new (MockBaseService as new (token: string) => unknown)(token);
    }

    static getDataServiceInstance(
      ServiceClass: new (token: string) => unknown,
      token: string,
    ) {
      return new ServiceClass(token);
    }
  }

  return { BaseService: MockBaseService };
});

describe('WatchlistService', () => {
  let service: WatchlistService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WatchlistService(mockToken);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(WatchlistService);
    expect((service as unknown as { endpoint: string }).endpoint).toBe(
      '/watchlists',
    );
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });

  describe('quickAdd', () => {
    it('posts to quick-add endpoint with platform and handle', async () => {
      const mockWatchlist = {
        handle: 'testuser',
        id: 'w1',
        platform: 'twitter',
      };
      mockPost.mockResolvedValue({ data: { data: mockWatchlist } });

      await service.quickAdd('twitter', 'testuser');

      expect(mockPost).toHaveBeenCalledWith('quick-add', {
        handle: 'testuser',
        platform: 'twitter',
      });
    });

    it('returns watchlist item', async () => {
      const mockWatchlist = {
        handle: 'company',
        id: 'w1',
        platform: 'linkedin',
      };
      mockPost.mockResolvedValue({ data: mockWatchlist });

      const result = await service.quickAdd('linkedin', 'company');
      expect(result).toBeDefined();
    });
  });

  describe('getInstance', () => {
    it('returns a WatchlistService instance', () => {
      const instance = WatchlistService.getInstance(mockToken);
      expect(instance).toBeInstanceOf(WatchlistService);
    });
  });
});
