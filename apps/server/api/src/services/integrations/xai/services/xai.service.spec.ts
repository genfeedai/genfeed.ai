import { ConfigService } from '@api/config/config.service';
import type { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { XaiService } from '@api/services/integrations/xai/services/xai.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('XaiService', () => {
  let service: XaiService;
  let mockConfigService: vi.Mocked<ConfigService>;
  let mockLogger: vi.Mocked<LoggerService>;
  let mockOpenRouterService: vi.Mocked<OpenRouterService>;

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
    const mockTrendsJson = JSON.stringify([
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
    ]);

    it('should return parsed trends from Grok', async () => {
      const mockResponse = createMockChatResponse(mockTrendsJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends({ limit: 10 });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        contentAngle: 'Create AI tutorial content',
        context: 'New AI model released',
        growthRate: 85,
        hashtags: ['#AI', '#MachineLearning'],
        mentions: 50000,
        topic: '#AINews',
      });
    });

    it('should use default limit of 10', async () => {
      const mockResponse = createMockChatResponse(mockTrendsJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      await service.getTrends();

      expect(mockOpenRouterService.chatCompletion).toHaveBeenCalledWith(
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
      const mockResponse = createMockChatResponse(mockTrendsJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      await service.getTrends({ limit: 5 });

      expect(mockOpenRouterService.chatCompletion).toHaveBeenCalledWith(
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

      const mockResponse = createMockChatResponse(mockTrendsJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      await service.getTrends({ limit: 5, region: 'US' });

      expect(mockOpenRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Today is 2026-03-10'),
            }),
          ]),
        }),
      );
      expect(mockOpenRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Region: US.'),
            }),
          ]),
        }),
      );
      expect(mockOpenRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('why it is trending today'),
            }),
          ]),
        }),
      );

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
          {
            provide: OpenRouterService,
            useValue: mockOpenRouterService,
          },
        ],
      }).compile();

      const configuredService = configuredModule.get<XaiService>(XaiService);

      const mockResponse = createMockChatResponse(mockTrendsJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      await configuredService.getTrends();

      expect(mockOpenRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'x-ai/grok-3',
        }),
      );
    });

    it('should use default model when not configured', async () => {
      const defaultModule: TestingModule = await Test.createTestingModule({
        providers: [
          XaiService,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn().mockReturnValue(null),
            },
          },
          { provide: LoggerService, useValue: mockLogger },
          {
            provide: OpenRouterService,
            useValue: mockOpenRouterService,
          },
        ],
      }).compile();

      const defaultService = defaultModule.get<XaiService>(XaiService);

      const mockResponse = createMockChatResponse(mockTrendsJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      await defaultService.getTrends();

      expect(mockOpenRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'x-ai/grok-4-fast',
        }),
      );
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('API error');
      mockOpenRouterService.chatCompletion.mockRejectedValue(error);

      await expect(service.getTrends()).rejects.toEqual(error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'XaiService.getTrends failed',
        error,
      );
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const wrappedJson = `\`\`\`json\n${mockTrendsJson}\n\`\`\``;
      const mockResponse = createMockChatResponse(wrappedJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends();

      expect(result).toHaveLength(2);
      expect(result[0].topic).toBe('#AINews');
    });

    it('should handle JSON wrapped in plain code blocks', async () => {
      const wrappedJson = `\`\`\`\n${mockTrendsJson}\n\`\`\``;
      const mockResponse = createMockChatResponse(wrappedJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends();

      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty content', async () => {
      const mockResponse = createMockChatResponse('');
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends();

      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Empty response from Grok'),
      );
    });

    it('should return empty array for invalid JSON', async () => {
      const mockResponse = createMockChatResponse('This is not JSON');
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends();

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse trends response'),
        expect.any(Error),
      );
    });

    it('should return empty array if response is not an array', async () => {
      const mockResponse = createMockChatResponse('{"topic": "single object"}');
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends();

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse trends response'),
        expect.any(Error),
      );
    });

    it('should normalize trend data with defaults', async () => {
      const incompleteJson = JSON.stringify([
        {
          topic: 'TestTrend',
        },
      ]);
      const mockResponse = createMockChatResponse(incompleteJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends();

      expect(result[0]).toEqual({
        contentAngle: 'Create engaging content',
        context: 'Trending topic',
        growthRate: 0,
        hashtags: [],
        mentions: 0,
        topic: 'TestTrend',
      });
    });

    it('should clamp growthRate between 0 and 100', async () => {
      const outOfRangeJson = JSON.stringify([
        {
          growthRate: -50,
          topic: 'Test1',
        },
        {
          growthRate: 150,
          topic: 'Test2',
        },
      ]);
      const mockResponse = createMockChatResponse(outOfRangeJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends();

      expect(result[0].growthRate).toBe(0);
      expect(result[1].growthRate).toBe(100);
    });

    it('should ensure mentions is non-negative', async () => {
      const negativeJson = JSON.stringify([
        {
          mentions: -100,
          topic: 'Test',
        },
      ]);
      const mockResponse = createMockChatResponse(negativeJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends();

      expect(result[0].mentions).toBe(0);
    });

    it('should handle non-array hashtags', async () => {
      const badHashtagsJson = JSON.stringify([
        {
          hashtags: 'not-an-array',
          topic: 'Test',
        },
      ]);
      const mockResponse = createMockChatResponse(badHashtagsJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends();

      expect(result[0].hashtags).toEqual([]);
    });

    it('should handle null content in response', async () => {
      const mockResponse = {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: null,
              role: 'assistant',
            },
          },
        ],
        id: 'chatcmpl-test',
        usage: { completion_tokens: 0, prompt_tokens: 10, total_tokens: 10 },
      } as unknown as OpenRouterChatCompletionResponse;
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends();

      expect(result).toEqual([]);
    });

    it('should handle empty choices in response', async () => {
      const mockResponse = {
        choices: [],
        id: 'chatcmpl-test',
        usage: { completion_tokens: 0, prompt_tokens: 10, total_tokens: 10 },
      } as unknown as OpenRouterChatCompletionResponse;
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends();

      expect(result).toEqual([]);
    });

    it('should provide default topic for missing topics', async () => {
      const noTopicJson = JSON.stringify([
        {
          mentions: 1000,
        },
      ]);
      const mockResponse = createMockChatResponse(noTopicJson);
      mockOpenRouterService.chatCompletion.mockResolvedValue(mockResponse);

      const result = await service.getTrends();

      expect(result[0].topic).toBe('Unknown');
    });
  });
});
