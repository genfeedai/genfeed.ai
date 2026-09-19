import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import type { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { XaiService } from '@api/services/integrations/xai/services/xai.service';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('XaiService', () => {
  let service: XaiService;
  let mockConfigService: vi.Mocked<ConfigService>;
  let mockLogger: vi.Mocked<LoggerService>;
  let mockOpenRouterService: vi.Mocked<OpenRouterService>;
  let mockLlmDispatcherService: {
    completeStructured: ReturnType<typeof vi.fn>;
  };

  const createMockChatResponse = (
    content: string,
  ): OpenRouterChatCompletionResponse => ({
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content,
          role: 'assistant',
        },
      },
    ],
    id: 'chatcmpl-test',
    usage: {
      completion_tokens: 20,
      prompt_tokens: 10,
      total_tokens: 30,
    },
  });

  beforeEach(async () => {
    mockConfigService = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'XAI_MODEL') {
          return 'grok-beta';
        }
        return undefined;
      }),
    } as unknown as vi.Mocked<ConfigService>;

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    mockOpenRouterService = {
      chatCompletion: vi.fn(),
    } as unknown as vi.Mocked<OpenRouterService>;

    mockLlmDispatcherService = { completeStructured: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XaiService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: OpenRouterService,
          useValue: mockOpenRouterService,
        },
        {
          provide: LlmDispatcherService,
          useValue: mockLlmDispatcherService,
        },
      ],
    }).compile();

    service = module.get<XaiService>(XaiService);

    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('chat', () => {
    it('should call openRouterService.chatCompletion with x-ai prefixed model', async () => {
      const mockResponse = createMockChatResponse('Hello!');
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const request = {
        messages: [{ content: 'Hello', role: 'user' as const }],
        model: 'grok-beta',
      };

      await service.chat(request);

      expect(mockOpenRouterService.chatCompletion).toHaveBeenCalledWith({
        max_tokens: undefined,
        messages: request.messages,
        model: 'x-ai/grok-beta',
        temperature: undefined,
      });
    });

    it('should return chat response data', async () => {
      const mockResponse = createMockChatResponse('Response content');
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.chat({
        messages: [{ content: 'Test', role: 'user' }],
        model: 'grok-beta',
      });

      expect(result).toEqual(mockResponse);
    });

    it('should not double-prefix model already starting with x-ai/', async () => {
      const mockResponse = createMockChatResponse('Hello!');
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      await service.chat({
        messages: [{ content: 'Test', role: 'user' }],
        model: 'x-ai/grok-beta',
      });

      expect(mockOpenRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'x-ai/grok-beta',
        }),
      );
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('OpenRouter API error');
      mockOpenRouterService.chatCompletion.mockRejectedValue(error);

      await expect(
        service.chat({
          messages: [{ content: 'Test', role: 'user' }],
          model: 'grok-beta',
        }),
      ).rejects.toEqual(error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'XaiService.chat failed',
        error,
      );
    });

    it('should handle non-Error objects in catch', async () => {
      const error = { code: 'RATE_LIMIT', message: 'Too many requests' };
      mockOpenRouterService.chatCompletion.mockRejectedValue(error);

      await expect(
        service.chat({
          messages: [{ content: 'Test', role: 'user' }],
          model: 'grok-beta',
        }),
      ).rejects.toEqual(error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'XaiService.chat failed',
        error,
      );
    });

    it('should pass temperature and max_tokens options', async () => {
      const mockResponse = createMockChatResponse('Response');
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      await service.chat({
        max_tokens: 1000,
        messages: [{ content: 'Test', role: 'user' as const }],
        model: 'grok-beta',
        temperature: 0.5,
      });

      expect(mockOpenRouterService.chatCompletion).toHaveBeenCalledWith({
        max_tokens: 1000,
        messages: [{ content: 'Test', role: 'user' as const }],
        model: 'x-ai/grok-beta',
        temperature: 0.5,
      });
    });
  });

  describe('getTrends', () => {
    const trends = [
      {
        contentAngle: 'Create AI tutorial content',
        context: 'New AI model released',
        growthRate: 85,
        hashtags: ['#AI', '#MachineLearning'],
        mentions: 50000,
        topic: '#AINews',
      },
      {
        contentAngle: 'Share civic engagement tips',
        context: 'Primary results announced',
        growthRate: 92,
        hashtags: ['#Politics', '#Vote'],
        mentions: 120000,
        topic: 'Election2024',
      },
    ];

    it('returns the validated trends from Grok', async () => {
      mockLlmDispatcherService.completeStructured.mockResolvedValue({ trends });

      const result = await service.getTrends({ limit: 10 });

      expect(result).toEqual(trends);
      expect(mockLlmDispatcherService.completeStructured).toHaveBeenCalledWith(
        expect.objectContaining({ schemaName: 'grok_trend_extraction' }),
      );
    });

    it('stops asking the model for a bare JSON array', async () => {
      mockLlmDispatcherService.completeStructured.mockResolvedValue({ trends });

      await service.getTrends();

      const [params] = mockLlmDispatcherService.completeStructured.mock
        .calls[0] as [{ messages: Array<{ content: string }> }];
      expect(params.messages[0].content).not.toContain('ONLY the JSON');
    });

    it('should use default limit of 10', async () => {
      mockLlmDispatcherService.completeStructured.mockResolvedValue({ trends });

      await service.getTrends();

      expect(mockLlmDispatcherService.completeStructured).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('top 10'),
            }),
          ]),
        }),
      );
    });

    it('should use custom limit', async () => {
      mockLlmDispatcherService.completeStructured.mockResolvedValue({ trends });

      await service.getTrends({ limit: 5 });

      expect(mockLlmDispatcherService.completeStructured).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('top 5'),
            }),
          ]),
        }),
      );
    });

    it('includes the current date, region, and freshness instructions in the prompt', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
      mockLlmDispatcherService.completeStructured.mockResolvedValue({ trends });

      await service.getTrends({ limit: 5, region: 'US' });

      const [params] = mockLlmDispatcherService.completeStructured.mock
        .calls[0] as [{ messages: Array<{ content: string }> }];
      expect(params.messages[0].content).toContain('Today is 2026-03-10');
      expect(params.messages[0].content).toContain('Region: US.');
      expect(params.messages[0].content).toContain('why it is trending today');

      vi.useRealTimers();
    });

    it('should use configured model', async () => {
      const configuredModule: TestingModule = await Test.createTestingModule({
        providers: [
          XaiService,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn().mockImplementation((key: string) => {
                if (key === 'XAI_MODEL') {
                  return 'grok-3';
                }
                return undefined;
              }),
            },
          },
          { provide: LoggerService, useValue: mockLogger },
          { provide: OpenRouterService, useValue: mockOpenRouterService },
          {
            provide: LlmDispatcherService,
            useValue: mockLlmDispatcherService,
          },
        ],
      }).compile();

      const configuredService = configuredModule.get<XaiService>(XaiService);
      mockLlmDispatcherService.completeStructured.mockResolvedValue({ trends });

      await configuredService.getTrends();

      expect(mockLlmDispatcherService.completeStructured).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'x-ai/grok-3' }),
      );
    });

    it('should use default model when not configured', async () => {
      const defaultModule: TestingModule = await Test.createTestingModule({
        providers: [
          XaiService,
          {
            provide: ConfigService,
            useValue: { get: vi.fn().mockReturnValue(null) },
          },
          { provide: LoggerService, useValue: mockLogger },
          { provide: OpenRouterService, useValue: mockOpenRouterService },
          {
            provide: LlmDispatcherService,
            useValue: mockLlmDispatcherService,
          },
        ],
      }).compile();

      const defaultService = defaultModule.get<XaiService>(XaiService);
      mockLlmDispatcherService.completeStructured.mockResolvedValue({ trends });

      await defaultService.getTrends();

      expect(mockLlmDispatcherService.completeStructured).toHaveBeenCalledWith(
        expect.objectContaining({ model: LLM_DEFAULTS.grok }),
      );
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('API error');
      mockLlmDispatcherService.completeStructured.mockRejectedValue(error);

      await expect(service.getTrends()).rejects.toEqual(error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'XaiService.getTrends failed',
        error,
      );
    });

    it('surfaces the typed error instead of returning an empty trend list', async () => {
      const error = new LlmStructuredOutputError('grok_trend_extraction', [
        {
          code: 'too_big',
          message: 'expected <= 100',
          path: 'trends.0.growthRate',
        },
      ]);
      mockLlmDispatcherService.completeStructured.mockRejectedValue(error);

      await expect(service.getTrends()).rejects.toBe(error);
    });
  });
});
