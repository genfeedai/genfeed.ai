import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.test.com',
  },
}));

vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class MockHTTPBaseService {
    public baseURL: string;
    public token: string;
    public instance = { get: mockGet };

    constructor(baseURL: string, token: string) {
      this.baseURL = baseURL;
      this.token = token;
    }
  },
}));

import {
  ElevenLabsService,
  type ElevenLabsVoice,
} from '@services/integrations/elevenlabs.service';

type ElevenLabsServiceClass = typeof ElevenLabsService & {
  instances: Map<string, ElevenLabsService>;
};

describe('ElevenLabsService', () => {
  const token = 'token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    (ElevenLabsService as unknown as ElevenLabsServiceClass).instances.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with api endpoint and token', () => {
    const service = new ElevenLabsService(token);

    const state = service as unknown as {
      baseURL: string;
      token: string;
    };

    expect(state.baseURL).toBe('https://api.test.com/avatars/elevenlabs');
    expect(state.token).toBe(token);
  });

  it('caches instances by token', () => {
    const first = ElevenLabsService.getInstance(token);
    const second = ElevenLabsService.getInstance(token);
    const other = ElevenLabsService.getInstance('token-456');

    expect(first).toBe(second);
    expect(other).not.toBe(first);
  });

  it('returns voices list from api response', async () => {
    const voices: ElevenLabsVoice[] = [
      { name: 'Voice 1', voiceId: 'voice-1' },
      { name: 'Voice 2', preview: 'https://preview', voiceId: 'voice-2' },
    ];

    mockGet.mockResolvedValue({
      data: {
        data: {
          attributes: {
            provider: 'elevenlabs',
            voices,
          },
          id: 'voices-1',
          type: 'voices',
        },
      },
    });

    const service = new ElevenLabsService(token);
    const result = await service.getVoices();

    expect(mockGet).toHaveBeenCalledWith('voices');
    expect(result).toEqual(voices);
  });
});
