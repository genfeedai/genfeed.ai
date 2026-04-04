import { SpeechService } from '@services/ai/speech.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    protected instance = {
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
    };
    static getInstance = vi.fn();
    static clearInstance = vi.fn();
  }
  return { HTTPBaseService: MockHTTPBaseService };
});

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai' },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('SpeechService', () => {
  let service: SpeechService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SpeechService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(SpeechService);
  });

  it('has transcription methods', () => {
    expect(typeof service.transcribeAudio).toBe('function');
    expect(typeof service.transcribeFromUrl).toBe('function');
  });
});
