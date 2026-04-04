import { Readable } from 'node:stream';
import { ConfigService } from '@api/config/config.service';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { OpenRouterService } from './openrouter.service';

const makeAxiosResponse = <T>(data: T) => ({ data });

describe('OpenRouterService', () => {
  let service: OpenRouterService;
  let configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;
  let httpService: vi.Mocked<HttpService>;

  const defaultParams: OpenRouterChatCompletionParams = {
    messages: [{ content: 'Hello', role: 'user' }],
    model: 'anthropic/claude-sonnet-4-5-20250929',
  };

  const mockResponse: OpenRouterChatCompletionResponse = {
    choices: [
      {
        finish_reason: 'stop',
        message: { content: 'Hi there!', role: 'assistant' },
      },
    ],
    id: 'gen-123',
    model: 'anthropic/claude-sonnet-4-5-20250929',
    usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 },
  };

  beforeEach(async () => {
    configService = {
      get: vi.fn().mockReturnValue('test-api-key'),
    } as unknown as vi.Mocked<ConfigService>;

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    httpService = {
      post: vi.fn(),
    } as unknown as vi.Mocked<HttpService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenRouterService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<OpenRouterService>(OpenRouterService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chatCompletion', () => {
    it('returns response data from the API', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse(mockResponse)));

      const result = await service.chatCompletion(defaultParams);

      expect(result).toEqual(mockResponse);
    });

    it('uses OPENROUTER_API_KEY from config by default', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse(mockResponse)));

      await service.chatCompletion(defaultParams);

      expect(configService.get).toHaveBeenCalledWith('OPENROUTER_API_KEY');
    });

    it('uses apiKeyOverride instead of config key when provided', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse(mockResponse)));

      await service.chatCompletion(defaultParams, 'override-key');

      expect(configService.get).not.toHaveBeenCalled();
    });

    it('posts with stream: false forced on', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse(mockResponse)));

      await service.chatCompletion(defaultParams);

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.stream).toBe(false);
    });

    it('includes correct Authorization header', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse(mockResponse)));

      await service.chatCompletion(defaultParams);

      const headers = (
        httpService.post.mock.calls[0][2] as { headers: Record<string, string> }
      ).headers;
      expect(headers.Authorization).toBe('Bearer test-api-key');
    });

    it('throws when OPENROUTER_API_KEY is not configured', async () => {
      configService.get.mockReturnValue(undefined as unknown as string);

      await expect(service.chatCompletion(defaultParams)).rejects.toThrow(
        'OPENROUTER_API_KEY is not configured',
      );
    });

    it('logs and rethrows error on HTTP failure', async () => {
      const err = Object.assign(new Error('502 Bad Gateway'), {
        response: {
          data: 'upstream error',
          status: 502,
          statusText: 'Bad Gateway',
        },
      });
      httpService.post.mockReturnValue(throwError(() => err));

      await expect(service.chatCompletion(defaultParams)).rejects.toThrow(
        '502 Bad Gateway',
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('chatCompletion failed'),
        expect.objectContaining({ status: 502 }),
      );
    });

    it('spreads original params into request body', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse(mockResponse)));
      const params: OpenRouterChatCompletionParams = {
        ...defaultParams,
        max_tokens: 200,
        temperature: 0.7,
      };

      await service.chatCompletion(params);

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(200);
    });

    it('passes plugins through unchanged', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse(mockResponse)));
      const params: OpenRouterChatCompletionParams = {
        ...defaultParams,
        plugins: [{ id: 'web' }],
      };

      await service.chatCompletion(params);

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.plugins).toEqual([{ id: 'web' }]);
    });
  });

  describe('streamChatCompletion', () => {
    it('parses SSE tokens into a text ReadableStream', async () => {
      const fakeStream = Readable.from([
        'data: {"id":"gen-1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"id":"gen-1","choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ]);
      httpService.post.mockReturnValue(of(makeAxiosResponse(fakeStream)));

      const result = await service.streamChatCompletion(defaultParams);
      const reader = result.getReader();
      let output = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        output += value;
      }

      expect(output).toBe('Hello world');
    });

    it('posts with stream: true forced on', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse({})));

      await service.streamChatCompletion(defaultParams);

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.stream).toBe(true);
    });

    it('uses responseType: stream in request config', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse({})));

      await service.streamChatCompletion(defaultParams);

      const config = httpService.post.mock.calls[0][2] as Record<
        string,
        unknown
      >;
      expect(config.responseType).toBe('stream');
    });

    it('uses apiKeyOverride when provided for streaming', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse({})));

      await service.streamChatCompletion(defaultParams, 'stream-key');

      const headers = (
        httpService.post.mock.calls[0][2] as { headers: Record<string, string> }
      ).headers;
      expect(headers.Authorization).toBe('Bearer stream-key');
    });

    it('throws when api key is missing for streaming', async () => {
      configService.get.mockReturnValue(undefined as unknown as string);

      await expect(service.streamChatCompletion(defaultParams)).rejects.toThrow(
        'OPENROUTER_API_KEY is not configured',
      );
    });

    it('logs and rethrows on streaming HTTP failure', async () => {
      const err = new Error('Network timeout');
      httpService.post.mockReturnValue(throwError(() => err));

      await expect(service.streamChatCompletion(defaultParams)).rejects.toThrow(
        'Network timeout',
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('streamChatCompletion failed'),
        expect.any(Object),
      );
    });
  });
});
