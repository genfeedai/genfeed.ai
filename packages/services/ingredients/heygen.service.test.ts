import type { IHeyGen } from '@genfeedai/contracts/interfaces';
import { HeyGenService as HeygenService } from '@services/ingredients/heygen.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDelete, mockGet, mockPatch, mockPost } = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.test.com/v1',
  },
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

    static getDataServiceInstance<TService>(
      ServiceClass: new (token: string) => TService,
      token: string,
    ): TService {
      return new ServiceClass(token);
    }
  }

  return { BaseService: MockBaseService };
});

describe('HeygenService', () => {
  let service: HeygenService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new HeygenService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(HeygenService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });

  it.each(['fetchAvatars', 'fetchVoices'] as const)(
    '%s lets the identity surface handle catalog outages and preserves cancellation',
    async (method) => {
      const failure = new Error('Catalog unavailable');
      const abort = new AbortController();
      mockGet.mockRejectedValueOnce(failure);

      await expect(service[method](abort.signal)).rejects.toBe(failure);
      expect(mockGet).toHaveBeenCalledWith(
        `https://api.test.com/v1/heygen/${method === 'fetchAvatars' ? 'avatars' : 'voices'}`,
        {
          handledErrorStatuses: [500, 502, 503, 504],
          signal: abort.signal,
        },
      );
      expect(mockPost).not.toHaveBeenCalled();
    },
  );

  it.each(['fetchAvatars', 'fetchVoices'] as const)(
    '%s retains the provider catalog response',
    async (method) => {
      const key = method === 'fetchAvatars' ? 'avatars' : 'voices';
      const items = [{ name: 'Saved identity' }];
      mockGet.mockResolvedValueOnce({
        data: { data: { attributes: { [key]: items } } },
      });
      await expect(service[method]()).resolves.toBe(items);
    },
  );

  it('generates avatar videos through the videos avatar endpoint', async () => {
    const response: IHeyGen = {
      createdAt: '2026-06-08T00:00:00.000Z',
      id: 'heygen-job-1',
      isDeleted: false,
      metadata: { status: 'queued' },
      provider: 'heygen',
      updatedAt: '2026-06-08T00:00:00.000Z',
    };
    mockPost.mockResolvedValueOnce({ data: response });

    const result = await service.generate({
      avatarId: 'avatar-1',
      text: 'Create a launch video',
      voiceId: 'voice-1',
      voiceProvider: 'elevenlabs',
    });

    expect(mockPost).toHaveBeenCalledWith(
      'https://api.test.com/v1/videos/avatar',
      {
        avatarId: 'avatar-1',
        elevenlabsVoiceId: 'voice-1',
        text: 'Create a launch video',
      },
    );
    expect(result).toBe(response);
  });
});
