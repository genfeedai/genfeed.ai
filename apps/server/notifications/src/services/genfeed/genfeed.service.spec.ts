import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { GenFeedService } from '@notifications/services/genfeed/genfeed.service';
import axios from 'axios';
import type { Mock, Mocked } from 'vitest';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

interface MockApiClient {
  delete: Mock;
  get: Mock;
  post: Mock;
  put: Mock;
}

describe('GenFeedService', () => {
  let service: GenFeedService;
  let apiClient: MockApiClient;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config: Record<string, string> = {
        GENFEEDAI_API_KEY: 'test-api-key',
        GENFEEDAI_API_URL: 'https://api.genfeed.ai',
      };
      return config[key];
    }),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    apiClient = {
      delete: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    };
    mockedAxios.create = vi.fn().mockReturnValue(apiClient);
    mockedAxios.isAxiosError = vi
      .fn()
      .mockReturnValue(false) as unknown as typeof axios.isAxiosError;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenFeedService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<GenFeedService>(GenFeedService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize with API configuration', () => {
    expect(mockConfigService.get).toHaveBeenCalledWith('GENFEEDAI_API_URL');
    expect(mockConfigService.get).toHaveBeenCalledWith('GENFEEDAI_API_KEY');
    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.genfeed.ai',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
        }),
      }),
    );
  });

  describe('generateResponse', () => {
    it('posts chat prompts to /prompts and returns the enhanced text', async () => {
      apiClient.post.mockResolvedValue({ data: { enhanced: 'enhanced text' } });

      const result = await service.generateResponse({
        prompt: 'hello',
        type: 'chat',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/prompts', {
        original: 'hello',
        type: 'chat',
      });
      expect(result).toBe('enhanced text');
    });

    it('falls back to result and text fields, defaulting type to chat', async () => {
      apiClient.post.mockResolvedValue({ data: { text: 'plain text' } });

      const result = await service.generateResponse({ prompt: 'hello' });

      expect(apiClient.post).toHaveBeenCalledWith('/prompts', {
        original: 'hello',
        type: 'chat',
      });
      expect(result).toBe('plain text');
    });

    it('posts tweet prompts to /prompts/tweet with tweet metadata', async () => {
      apiClient.post.mockResolvedValue({ data: { reply: 'tweet reply' } });

      const result = await service.generateResponse({
        metadata: { tone: 'witty' },
        prompt: 'tweet content',
        type: 'tweet',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/prompts/tweet', {
        length: 'medium',
        tone: 'witty',
        tweetContent: 'tweet content',
      });
      expect(result).toBe('tweet reply');
    });

    it('returns empty string when the API returns no usable field', async () => {
      apiClient.post.mockResolvedValue({ data: {} });

      const result = await service.generateResponse({ prompt: 'hello' });

      expect(result).toBe('');
    });

    it('throws an auth error for 401 axios failures', async () => {
      const error = Object.assign(new Error('Unauthorized'), {
        response: { status: 401 },
      });
      apiClient.post.mockRejectedValue(error);
      (mockedAxios.isAxiosError as unknown as Mock).mockReturnValue(true);

      await expect(
        service.generateResponse({ prompt: 'hello' }),
      ).rejects.toThrow('Genfeed API authentication failed');
    });

    it('rethrows non-auth failures', async () => {
      apiClient.post.mockRejectedValue(new Error('timeout'));

      await expect(
        service.generateResponse({ prompt: 'hello' }),
      ).rejects.toThrow('timeout');
    });
  });

  describe('generateTweetReply', () => {
    it('posts tweet reply options with defaults', async () => {
      apiClient.post.mockResolvedValue({ data: { reply: 'nice tweet' } });

      const result = await service.generateTweetReply({
        tweetContent: 'original tweet',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/prompts/tweet', {
        length: 'medium',
        tagGrok: false,
        tone: 'friendly',
        tweetAuthor: undefined,
        tweetContent: 'original tweet',
        tweetUrl: undefined,
      });
      expect(result).toBe('nice tweet');
    });

    it('returns empty string when reply is missing', async () => {
      apiClient.post.mockResolvedValue({ data: {} });

      const result = await service.generateTweetReply({
        tweetContent: 'original tweet',
      });

      expect(result).toBe('');
    });

    it('rethrows API failures', async () => {
      apiClient.post.mockRejectedValue(new Error('api down'));

      await expect(
        service.generateTweetReply({ tweetContent: 'x' }),
      ).rejects.toThrow('api down');
    });
  });

  describe('enhancePrompt', () => {
    it('returns the enhanced prompt', async () => {
      apiClient.post.mockResolvedValue({ data: { enhanced: 'better prompt' } });

      const result = await service.enhancePrompt('prompt', 'image');

      expect(apiClient.post).toHaveBeenCalledWith('/prompts', {
        original: 'prompt',
        type: 'image',
      });
      expect(result).toBe('better prompt');
    });

    it('defaults the type to video and falls back to result field', async () => {
      apiClient.post.mockResolvedValue({ data: { result: 'video prompt' } });

      const result = await service.enhancePrompt('prompt');

      expect(apiClient.post).toHaveBeenCalledWith('/prompts', {
        original: 'prompt',
        type: 'video',
      });
      expect(result).toBe('video prompt');
    });

    it('returns the original prompt when enhancement fails', async () => {
      apiClient.post.mockRejectedValue(new Error('api down'));

      const result = await service.enhancePrompt('original prompt');

      expect(result).toBe('original prompt');
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  describe('checkHealth', () => {
    it('returns true for a 200 health response', async () => {
      apiClient.get.mockResolvedValue({ status: 200 });

      await expect(service.checkHealth()).resolves.toBe(true);
      expect(apiClient.get).toHaveBeenCalledWith('/v1/health');
    });

    it('returns false when the health check throws', async () => {
      apiClient.get.mockRejectedValue(new Error('down'));

      await expect(service.checkHealth()).resolves.toBe(false);
    });
  });
});
