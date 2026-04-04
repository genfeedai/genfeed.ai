import { BotsService } from '@services/automation/bots.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindAll = vi.fn().mockResolvedValue([]);
const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    public endpoint: string;
    public instance: {
      get: typeof mockGet;
      post: typeof mockPost;
    };
    public token: string;

    constructor(endpoint: string, token: string, ..._rest: unknown[]) {
      this.endpoint = endpoint;
      this.instance = {
        get: mockGet,
        post: mockPost,
      };
      this.token = token;
    }

    async findAll(params?: unknown) {
      return mockFindAll(params);
    }
    async findOne(_id: string) {
      return {};
    }
    async post(...args: [unknown] | [string, unknown]) {
      if (args.length === 2) {
        return mockPost(args[0], args[1]);
      }

      return mockPost(args[0]);
    }
    async patch(_id: string, _data: unknown) {
      return {};
    }
    async delete(_id: string) {
      return undefined;
    }

    static getInstance(this: unknown, token: string) {
      return new (MockBaseService as new (token: string) => unknown)(token);
    }

    static getDataServiceInstance(
      this: unknown,
      ctor: new (token: string) => unknown,
      token: string,
    ) {
      return new ctor(token);
    }

    static clearInstance(this: unknown, _token?: string) {
      return undefined;
    }

    static clearAllInstances(this: unknown) {
      return undefined;
    }
  }

  return { BaseService: MockBaseService };
});

describe('BotsService', () => {
  let service: BotsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    mockPost.mockReset();
    service = new BotsService(mockToken);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(BotsService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });

  describe('findAllByOrganization', () => {
    it('calls findAll with organization scope', async () => {
      const orgId = 'org-123';
      await service.findAllByOrganization(orgId);
      expect(mockFindAll).toHaveBeenCalledWith({
        organization: orgId,
        pagination: false,
        scope: 'organization',
      });
    });

    it('returns bots array', async () => {
      mockFindAll.mockResolvedValueOnce([{ id: 'bot-1' }, { id: 'bot-2' }]);
      const result = await service.findAllByOrganization('org-123');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });

  describe('findAllByAccount', () => {
    it('calls findAll with brand scope', async () => {
      const brandId = 'brand-456';
      await service.findAllByAccount(brandId);
      expect(mockFindAll).toHaveBeenCalledWith({
        brand: brandId,
        pagination: false,
        scope: 'brand',
      });
    });
  });

  describe('findAllByUser', () => {
    it('calls findAll with user scope', async () => {
      const userId = 'user-789';
      await service.findAllByUser(userId);
      expect(mockFindAll).toHaveBeenCalledWith({
        pagination: false,
        scope: 'user',
        user: userId,
      });
    });
  });

  describe('getInstance', () => {
    it('returns a BotsService instance', () => {
      const instance = BotsService.getInstance(mockToken);
      expect(instance).toBeInstanceOf(BotsService);
    });
  });

  describe('livestream session methods', () => {
    it('requests the livestream session for a bot', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          data: {
            attributes: {
              status: 'active',
            },
            id: 'session-1',
            type: 'livestream-session',
          },
        },
      });

      await service.getLivestreamSession('bot-123');

      expect(mockGet).toHaveBeenCalledWith('/bot-123/livestream-session');
    });

    it('posts transcript chunks to the livestream session endpoint', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          data: {
            attributes: {
              status: 'active',
            },
            id: 'session-1',
            type: 'livestream-bot-session',
          },
        },
      });

      await service.ingestTranscriptChunk('bot-123', {
        confidence: 0.84,
        text: 'We are discussing multimodal agents.',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/bot-123/livestream-session/transcript',
        {
          confidence: 0.84,
          text: 'We are discussing multimodal agents.',
        },
      );
    });

    it('starts the livestream session with the shared subroute', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          data: {
            attributes: {
              status: 'active',
            },
            id: 'session-1',
            type: 'livestream-bot-session',
          },
        },
      });

      await service.startLivestreamSession('bot-123');

      expect(mockPost).toHaveBeenCalledWith(
        '/bot-123/livestream-session/start',
        {},
      );
    });
  });
});
