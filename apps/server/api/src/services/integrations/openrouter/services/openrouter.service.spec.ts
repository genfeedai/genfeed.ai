import { Readable } from 'node:stream';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import type { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import type { Mocked } from 'vitest';
import { OpenRouterService } from './openrouter.service';

const makeAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
  config: {} as AxiosResponse<T>['config'],
  data,
  headers: {},
  status: 200,
  statusText: 'OK',
});

describe('OpenRouterService', () => {
  let service: OpenRouterService;
  let configService: Mocked<ConfigService>;
  let loggerService: Mocked<LoggerService>;
  let httpService: Mocked<HttpService>;

  const defaultParams: OpenRouterChatCompletionParams = {
    messages: [{ content: 'Hello', role: 'user' }],
    model: 'anthropic/claude-sonnet-5',
    provider: { data_collection: 'deny', zdr: true },
  };

  const mockResponse: OpenRouterChatCompletionResponse = {
    choices: [
      {
        finish_reason: 'stop',
        message: { content: 'Hi there!', role: 'assistant' },
      },
    ],
    id: 'gen-123',
    model: 'anthropic/claude-sonnet-5',
    usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 },
  };

  beforeEach(async () => {
    configService = {
      get: vi.fn().mockReturnValue('test-api-key'),
    } as unknown as Mocked<ConfigService>;

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Mocked<LoggerService>;

    httpService = {
      get: vi
        .fn()
        .mockReturnValue(
          of(makeAxiosResponse({ data: { model: mockResponse.model } })),
        ),
      post: vi.fn(),
    } as unknown as Mocked<HttpService>;

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

    it('falls back to generation metadata for exact cost and actual model', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse(mockResponse)));
      httpService.get.mockReturnValue(
        of(
          makeAxiosResponse({
            data: {
              is_byok: false,
              model: 'openai/gpt-5.6-terra',
              total_cost: 0.0142,
            },
          }),
        ),
      );

      const result = await service.chatCompletion({
        ...defaultParams,
        model: 'openrouter/auto',
      });

      expect(httpService.get).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/generation',
        expect.objectContaining({ params: { id: 'gen-123' } }),
      );
      expect(result).toMatchObject({
        model: 'openai/gpt-5.6-terra',
        usage: { cost: 0.0142, cost_source: 'generation' },
      });
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

    it('posts OpenRouter zdr and deny data_collection on first-party requests', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse(mockResponse)));

      await service.chatCompletion(defaultParams);

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.provider).toEqual({
        data_collection: 'deny',
        zdr: true,
      });
    });

    it('keeps zdr and deny data_collection when a BYOK key is supplied', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse(mockResponse)));

      await service.chatCompletion(defaultParams, 'override-key');

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.provider).toEqual({
        data_collection: 'deny',
        zdr: true,
      });
    });

    it('overwrites weaker caller provider prefs with the first-party policy', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse(mockResponse)));
      const params: OpenRouterChatCompletionParams = {
        ...defaultParams,
        provider: { data_collection: 'allow', zdr: false },
      };

      await service.chatCompletion(params);

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.provider).toEqual({
        data_collection: 'deny',
        zdr: true,
      });
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

    it('does not retry after an upstream rate limit', async () => {
      const rateLimitError = Object.assign(new Error('Provider rate limited'), {
        response: { status: 429, statusText: 'Too Many Requests' },
      });
      httpService.post.mockReturnValue(throwError(() => rateLimitError));

      await expect(service.chatCompletion(defaultParams)).rejects.toMatchObject(
        {
          response: { status: 429 },
        },
      );
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });

    it('does not retry a route-unavailable 404', async () => {
      const unavailableRouteError = Object.assign(
        new Error('Request failed with status code 404'),
        {
          response: {
            data: {
              error: {
                code: 404,
                message:
                  'No endpoints found matching your data policy (Zero data retention).',
              },
            },
            status: 404,
            statusText: 'Not Found',
          },
        },
      );
      httpService.post.mockReturnValue(throwError(() => unavailableRouteError));

      await expect(service.chatCompletion(defaultParams)).rejects.toMatchObject(
        { response: { status: 404 } },
      );
      expect(httpService.post).toHaveBeenCalledTimes(1);
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

    it('posts OpenRouter zdr and deny data_collection on stream requests', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse({})));

      await service.streamChatCompletion(defaultParams);

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.provider).toEqual({
        data_collection: 'deny',
        zdr: true,
      });
    });

    it('keeps zdr and deny data_collection on BYOK stream requests', async () => {
      httpService.post.mockReturnValue(of(makeAxiosResponse({})));

      await service.streamChatCompletion(defaultParams, 'stream-key');

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.provider).toEqual({
        data_collection: 'deny',
        zdr: true,
      });
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

  describe('streamChatCompletionAggregated', () => {
    it('emits text deltas and aggregates content, id and usage', async () => {
      const fakeStream = Readable.from([
        'data: {"id":"gen-9","choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"id":"gen-9","choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
        'data: [DONE]\n\n',
      ]);
      httpService.post.mockReturnValue(of(makeAxiosResponse(fakeStream)));

      const tokens: string[] = [];
      const result = await service.streamChatCompletionAggregated(
        defaultParams,
        undefined,
        async (delta: string) => {
          tokens.push(delta);
        },
      );

      expect(tokens).toEqual(['Hello', ' world']);
      expect(result.choices[0]?.message.content).toBe('Hello world');
      expect(result.choices[0]?.finish_reason).toBe('stop');
      expect(result.id).toBe('gen-9');
      expect(result.usage.total_tokens).toBe(5);
    });

    it('requests usage inclusion and forces stream: true', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse(Readable.from(['data: [DONE]\n\n']))),
      );

      await service.streamChatCompletionAggregated(defaultParams);

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.stream).toBe(true);
      expect(body.usage).toEqual({ include: true });
    });

    it('posts OpenRouter zdr and deny data_collection on aggregated stream requests', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse(Readable.from(['data: [DONE]\n\n']))),
      );

      await service.streamChatCompletionAggregated(defaultParams);

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.provider).toEqual({
        data_collection: 'deny',
        zdr: true,
      });
    });

    it('keeps zdr and deny data_collection on BYOK aggregated stream requests', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse(Readable.from(['data: [DONE]\n\n']))),
      );

      await service.streamChatCompletionAggregated(
        defaultParams,
        'aggregated-key',
      );

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.provider).toEqual({
        data_collection: 'deny',
        zdr: true,
      });
    });

    it('accumulates tool-call fragments split across SSE chunks', async () => {
      const fakeStream = Readable.from([
        'data: {"id":"gen-1","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"search","arguments":""}}]}}]}\n\n',
        'data: {"id":"gen-1","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"q\\":\\"we"}}]}}]}\n\n',
        'data: {"id":"gen-1","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ather\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ]);
      httpService.post.mockReturnValue(of(makeAxiosResponse(fakeStream)));

      const result =
        await service.streamChatCompletionAggregated(defaultParams);

      const toolCalls = result.choices[0]?.message.tool_calls;
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls?.[0]).toEqual({
        function: { arguments: '{"q":"weather"}', name: 'search' },
        id: 'call-1',
        type: 'function',
      });
      expect(result.choices[0]?.finish_reason).toBe('tool_calls');
    });

    it('logs and rethrows on streaming HTTP failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Network timeout')),
      );

      await expect(
        service.streamChatCompletionAggregated(defaultParams),
      ).rejects.toThrow('Network timeout');
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('streamChatCompletionAggregated failed'),
        expect.any(Object),
      );
    });

    it('does not retry an SSE-level error after forwarding a token', async () => {
      const partialStream = Readable.from([
        'data: {"id":"gen-partial","choices":[{"delta":{"content":"Partial"},"finish_reason":null}]}\n\n',
        'data: {"error":{"code":429,"message":"Provider rate limited"}}\n\n',
      ]);
      httpService.post.mockReturnValue(of(makeAxiosResponse(partialStream)));
      const tokens: string[] = [];

      await expect(
        service.streamChatCompletionAggregated(
          defaultParams,
          undefined,
          async (token) => {
            tokens.push(token);
          },
        ),
      ).rejects.toMatchObject({ response: { status: 429 } });

      expect(tokens).toEqual(['Partial']);
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });
  });
});
