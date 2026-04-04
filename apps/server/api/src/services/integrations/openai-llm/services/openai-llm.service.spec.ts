import { ConfigService } from '@api/config/config.service';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

const mockCreate = vi.fn();

vi.mock('openai', () => {
  const MockOpenAI = vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
  });
  return { default: MockOpenAI };
});

import { OpenAiLlmService } from './openai-llm.service';

const makeParams = (
  overrides: Partial<OpenRouterChatCompletionParams> = {},
): OpenRouterChatCompletionParams => ({
  max_tokens: 512,
  messages: [{ content: 'Hello', role: 'user' }],
  model: 'gpt-4o',
  temperature: 0.7,
  ...overrides,
});

const makeOpenAIResponse = (
  content: string | null = 'Hello back',
  toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
) => ({
  choices: [
    {
      finish_reason: 'stop',
      message: {
        content,
        role: 'assistant',
        tool_calls: toolCalls,
      },
    },
  ],
  id: 'chatcmpl-test-001',
  usage: { completion_tokens: 10, prompt_tokens: 5, total_tokens: 15 },
});

// Avoid importing OpenAI types directly; use inline shape
type OpenAI = typeof import('openai').default;

describe('OpenAiLlmService', () => {
  let service: OpenAiLlmService;
  let configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    mockCreate.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAiLlmService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('sk-test-key') },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(OpenAiLlmService);
    configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chatCompletion', () => {
    it('should return a well-formed response for a simple text completion', async () => {
      mockCreate.mockResolvedValue(makeOpenAIResponse('Hi there'));

      const result: OpenRouterChatCompletionResponse =
        await service.chatCompletion(makeParams());

      expect(result.id).toBe('chatcmpl-test-001');
      expect(result.choices[0]?.message.content).toBe('Hi there');
      expect(result.choices[0]?.message.role).toBe('assistant');
      expect(result.usage.total_tokens).toBe(15);
    });

    it('should strip the openai/ prefix from model name', async () => {
      mockCreate.mockResolvedValue(makeOpenAIResponse());

      await service.chatCompletion(makeParams({ model: 'openai/gpt-4o' }));

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.model).toBe('gpt-4o');
    });

    it('should strip the local/ prefix from model name', async () => {
      mockCreate.mockResolvedValue(makeOpenAIResponse());

      await service.chatCompletion(
        makeParams({ model: 'local/llama3-instruct' }),
      );

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.model).toBe('llama3-instruct');
    });

    it('should omit temperature and max_tokens for reasoning models (o3)', async () => {
      mockCreate.mockResolvedValue(makeOpenAIResponse());

      await service.chatCompletion(
        makeParams({ max_tokens: 1024, model: 'o3-mini', temperature: 1.0 }),
      );

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.temperature).toBeUndefined();
      expect(callArgs.max_tokens).toBeUndefined();
    });

    it('should omit temperature and max_tokens for o4-mini', async () => {
      mockCreate.mockResolvedValue(makeOpenAIResponse());

      await service.chatCompletion(
        makeParams({ max_tokens: 512, model: 'o4-mini', temperature: 0.5 }),
      );

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.temperature).toBeUndefined();
    });

    it('should map tool_calls from the response correctly', async () => {
      const toolCalls = [
        {
          function: { arguments: '{"q":"weather"}', name: 'search' },
          id: 'call-1',
          type: 'function' as const,
        },
      ];
      mockCreate.mockResolvedValue(makeOpenAIResponse(null, toolCalls));

      const result = await service.chatCompletion(makeParams());

      expect(result.choices[0]?.message.tool_calls).toHaveLength(1);
      expect(result.choices[0]?.message.tool_calls?.[0]?.function.name).toBe(
        'search',
      );
    });

    it('should use apiKeyOverride when provided', async () => {
      mockCreate.mockResolvedValue(makeOpenAIResponse());
      configService.get.mockReturnValue(undefined as never);

      // Should not throw despite no env key set
      await service.chatCompletion(makeParams(), 'sk-override-key');

      expect(mockCreate).toHaveBeenCalled();
    });

    it('should throw when no API key is configured', async () => {
      configService.get.mockReturnValue(undefined as never);

      await expect(service.chatCompletion(makeParams())).rejects.toThrow(
        'OPENAI_API_KEY is not configured',
      );
    });

    it('should log error and re-throw on API failure', async () => {
      mockCreate.mockRejectedValue({ message: 'rate limit', status: 429 });

      await expect(service.chatCompletion(makeParams())).rejects.toMatchObject({
        status: 429,
      });

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('chatCompletion failed'),
        expect.objectContaining({ status: 429 }),
      );
    });

    it('should return null tool_calls when no tool calls in response', async () => {
      mockCreate.mockResolvedValue(makeOpenAIResponse('plain text', undefined));

      const result = await service.chatCompletion(makeParams());

      expect(result.choices[0]?.message.tool_calls).toBeUndefined();
    });

    it('should extract reasoning_content from o3 response if present', async () => {
      const rawResponse = {
        ...makeOpenAIResponse(null),
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: 'answer',
              reasoning_content: 'chain of thought',
              role: 'assistant',
            },
          },
        ],
      };
      mockCreate.mockResolvedValue(rawResponse);

      const result = await service.chatCompletion(
        makeParams({ model: 'o3-mini' }),
      );

      expect(result.choices[0]?.message.reasoning_content).toBe(
        'chain of thought',
      );
    });
  });

  describe('streamChatCompletion', () => {
    it('should return a ReadableStream', async () => {
      async function* asyncGen() {
        yield { choices: [{ delta: { content: 'Hello' } }] };
        yield { choices: [{ delta: { content: ' world' } }] };
      }
      mockCreate.mockResolvedValue(asyncGen());

      const stream = await service.streamChatCompletion(makeParams());

      expect(stream).toBeInstanceOf(ReadableStream);
    });

    it('should throw when API key is missing for streaming', async () => {
      configService.get.mockReturnValue(undefined as never);

      await expect(service.streamChatCompletion(makeParams())).rejects.toThrow(
        'OPENAI_API_KEY is not configured',
      );
    });

    it('should use baseURL when provided (bypass API key check)', async () => {
      async function* asyncGen() {
        yield { choices: [{ delta: { content: 'x' } }] };
      }
      mockCreate.mockResolvedValue(asyncGen());
      configService.get.mockReturnValue(undefined as never);

      const stream = await service.streamChatCompletion(
        makeParams(),
        undefined,
        'http://local-llm:8080/v1',
      );

      expect(stream).toBeInstanceOf(ReadableStream);
    });
  });
});
