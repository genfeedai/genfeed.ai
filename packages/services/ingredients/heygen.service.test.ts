import type { IHeyGen } from '@genfeedai/interfaces';
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
      audioUrl: 'https://cdn.example.com/audio.mp3',
      text: 'Create a launch video',
      voiceId: 'voice-1',
    });

    expect(mockPost).toHaveBeenCalledWith(
      'https://api.test.com/v1/videos/avatar',
      {
        audioUrl: 'https://cdn.example.com/audio.mp3',
        avatarId: 'avatar-1',
        elevenlabsVoiceId: 'voice-1',
        text: 'Create a launch video',
      },
    );
    expect(result).toBe(response);
  });
});
