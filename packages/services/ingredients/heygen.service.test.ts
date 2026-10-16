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

  it('loads HeyGen Voice speech voices from their own endpoint with cancellation', async () => {
    const voices = [
      {
        voiceId: 'clone-1',
        name: 'Founder clone',
        mode: 'instant',
        language: 'en',
        ownership: 'private',
      },
    ];
    const abort = new AbortController();
    mockGet.mockResolvedValueOnce({
      data: {
        data: {
          attributes: {
            count: 1,
            hasPersonalConnection: true,
            provider: 'heygen',
            voices,
          },
        },
      },
    });

    await expect(service.fetchSpeechVoices(abort.signal)).resolves.toEqual({
      hasPersonalConnection: true,
      voices,
    });
    expect(mockGet).toHaveBeenCalledWith(
      'https://api.test.com/v1/heygen/speech-voices',
      {
        handledErrorStatuses: [500, 502, 503, 504],
        signal: abort.signal,
      },
    );
  });

  it('rethrows speech voice outages so the caller can degrade', async () => {
    const failure = new Error('HeyGen unavailable');
    mockGet.mockRejectedValueOnce(failure);

    await expect(service.fetchSpeechVoices()).rejects.toBe(failure);
  });

  it('loads a single ownership-bound page with continuation and cancellation', async () => {
    const page = { avatars: [], ownership: 'private', nextCursor: 'next' };
    const abort = new AbortController();
    mockGet.mockResolvedValueOnce({ data: { data: { attributes: page } } });
    await expect(
      service.fetchAvatarPage({
        ownership: 'private',
        cursor: 'current',
        signal: abort.signal,
      }),
    ).resolves.toBe(page);
    expect(mockGet).toHaveBeenCalledWith(
      'https://api.test.com/v1/heygen/avatars/page',
      {
        handledErrorStatuses: [500, 502, 503, 504],
        signal: abort.signal,
        params: { ownership: 'private', cursor: 'current' },
      },
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

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
  it('refuses a voice id without a supported provider instead of guessing the catalog', async () => {
    await expect(
      service.quote({ text: 'Hi', voiceId: 'voice-1' }),
    ).rejects.toThrow('Choose a voice with its provider before generating.');
    await expect(
      service.generate({
        text: 'Hi',
        voiceId: 'voice-1',
        voiceProvider: 'unknown',
      }),
    ).rejects.toThrow('Choose a voice with its provider before generating.');
    expect(mockPost).not.toHaveBeenCalled();
  });
  it('quotes the generate body on the avatar quote endpoint with cancellation', async () => {
    const abort = new AbortController();
    mockPost.mockResolvedValueOnce({
      data: {
        data: {
          attributes: {
            billingMode: 'platform',
            credits: 52,
            estimatedSeconds: 4,
            modelKey: 'heygen/avatar',
          },
          id: 'quote-1',
          type: 'avatar-generation-quote',
        },
      },
    });

    const quote = await service.quote(
      {
        photoUrl: 'https://cdn.test/portrait.png',
        text: 'Create a launch video',
        voiceId: 'voice-1',
        voiceProvider: 'heygen',
      },
      abort.signal,
    );

    expect(mockPost).toHaveBeenCalledWith(
      'https://api.test.com/v1/videos/avatar/quote',
      {
        heygenVoiceId: 'voice-1',
        photoUrl: 'https://cdn.test/portrait.png',
        text: 'Create a launch video',
      },
      expect.objectContaining({ signal: abort.signal }),
    );
    expect(quote).toEqual({
      billingMode: 'platform',
      credits: 52,
      estimatedSeconds: 4,
      modelKey: 'heygen/avatar',
    });
  });

  it('reads a BYOK quote with no per-second estimate', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        data: {
          attributes: {
            billingMode: 'byok',
            credits: 0,
            modelKey: 'heygen/avatar-iv',
          },
          id: 'quote-2',
          type: 'avatar-generation-quote',
        },
      },
    });

    await expect(
      service.quote({ text: 'Hi', voiceId: 'v', voiceProvider: 'heygen' }),
    ).resolves.toEqual({
      billingMode: 'byok',
      credits: 0,
      estimatedSeconds: null,
      modelKey: 'heygen/avatar-iv',
    });
  });

  it.each([
    { billingMode: 'free', credits: 1, modelKey: 'heygen/avatar' },
    { billingMode: 'platform', credits: -1, modelKey: 'heygen/avatar' },
    { billingMode: 'platform', credits: 1.5, modelKey: 'heygen/avatar' },
    { billingMode: 'platform', credits: 1 },
  ])(
    'rejects a malformed quote %j instead of showing it',
    async (attributes) => {
      mockPost.mockResolvedValueOnce({ data: { data: { attributes } } });

      await expect(
        service.quote({ text: 'Hi', voiceId: 'v', voiceProvider: 'heygen' }),
      ).rejects.toThrow('Avatar quote response is malformed');
    },
  );
});
