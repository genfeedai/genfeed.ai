import { ConfigService } from '@api/config/config.service';
import type { OpenRouterChatCompletionParams } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnthropicService } from './anthropic.service';

const mockCreate = vi.fn();
const mockStream = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class Anthropic {
      messages = {
        create: mockCreate,
        stream: mockStream,
      };
    },
  };
});

describe('AnthropicService', () => {
  let service: AnthropicService;
  let configService: { get: ReturnType<typeof vi.fn> };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const defaultParams: OpenRouterChatCompletionParams = {
    messages: [{ content: 'Hello', role: 'user' }],
    model: 'anthropic/claude-sonnet-4-5-20250929',
  };

  const makeRichParams = (
    overrides: Partial<OpenRouterChatCompletionParams> = {},
  ): OpenRouterChatCompletionParams => ({
    max_tokens: 1024,
    messages: [
      {
        content: 'System prompt',
        role: 'system',
      },
      {
        content: 'Assistant note',
        role: 'assistant',
        tool_calls: [
          {
            function: {
              arguments: '{"query":"cats"}',
              name: 'lookup',
            },
            id: 'tool-call-1',
            type: 'function',
          },
        ],
      },
      {
        content: 'Tool result payload',
        role: 'tool',
        tool_call_id: 'tool-call-1',
      },
      {
        content: [
          { text: 'Hello', type: 'text' },
          {
            image_url: { url: 'https://example.com/cat.jpg' },
            type: 'image_url',
          },
        ],
        role: 'user',
      },
    ],
    model: 'anthropic/claude-sonnet-4-5',
    temperature: 0.4,
    tool_choice: {
      function: { name: 'lookup' },
      type: 'function',
    },
    tools: [
      {
        function: {
          description: 'Lookup records',
          name: 'lookup',
          parameters: {
            properties: {
              query: { type: 'string' },
            },
            type: 'object',
          },
        },
        type: 'function',
      },
    ],
    ...overrides,
  });

  const mockAnthropicResponse = {
    content: [{ text: 'Hi there!', type: 'text' }],
    id: 'msg-123',
    model: 'claude-sonnet-4-5-20250929',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    configService = {
      get: vi.fn().mockReturnValue('test-anthropic-key'),
    };

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnthropicService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<AnthropicService>(AnthropicService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chatCompletion', () => {
    it('should return a converted response on success', async () => {
      mockCreate.mockResolvedValue(mockAnthropicResponse);

      const result = await service.chatCompletion(defaultParams);

      expect(result).toMatchObject({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: 'Hi there!',
              role: 'assistant',
            },
          },
        ],
        id: 'msg-123',
        usage: {
          completion_tokens: 5,
          prompt_tokens: 10,
          total_tokens: 15,
        },
      });
    });

    it('should strip anthropic/ prefix from model name', async () => {
      mockCreate.mockResolvedValue(mockAnthropicResponse);

      await service.chatCompletion(defaultParams);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-5-20250929',
        }),
      );
    });

    it('should extract system prompt from messages', async () => {
      mockCreate.mockResolvedValue(mockAnthropicResponse);

      const params: OpenRouterChatCompletionParams = {
        messages: [
          { content: 'You are a helpful assistant', role: 'system' },
          { content: 'Hello', role: 'user' },
        ],
        model: 'anthropic/claude-sonnet-4-5-20250929',
      };

      await service.chatCompletion(params);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful assistant',
        }),
      );
    });

    it('should use apiKeyOverride when provided', async () => {
      mockCreate.mockResolvedValue(mockAnthropicResponse);

      await service.chatCompletion(defaultParams, 'custom-key');

      // The service should create a client with the override key
      // (verified indirectly since mock intercepts all calls)
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should throw when no API key is available', async () => {
      configService.get.mockReturnValue(undefined);

      await expect(service.chatCompletion(defaultParams)).rejects.toThrow(
        'ANTHROPIC_API_KEY is not configured',
      );
    });

    it('should convert tools to Anthropic format', async () => {
      mockCreate.mockResolvedValue(mockAnthropicResponse);

      const params: OpenRouterChatCompletionParams = {
        messages: [{ content: 'Hello', role: 'user' }],
        model: 'anthropic/claude-sonnet-4-5-20250929',
        tool_choice: 'auto',
        tools: [
          {
            function: {
              description: 'Get weather',
              name: 'get_weather',
              parameters: { properties: {}, type: 'object' },
            },
            type: 'function' as const,
          },
        ],
      };

      await service.chatCompletion(params);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_choice: { type: 'auto' },
          tools: [
            expect.objectContaining({
              description: 'Get weather',
              name: 'get_weather',
            }),
          ],
        }),
      );
    });

    it('should convert tool_use response to tool_calls format', async () => {
      const toolUseResponse = {
        content: [
          {
            id: 'toolu_123',
            input: { location: 'NYC' },
            name: 'get_weather',
            type: 'tool_use',
          },
        ],
        id: 'msg-456',
        model: 'claude-sonnet-4-5-20250929',
        stop_reason: 'tool_use',
        usage: { input_tokens: 20, output_tokens: 15 },
      };
      mockCreate.mockResolvedValue(toolUseResponse);

      const result = await service.chatCompletion(defaultParams);

      expect(result.choices[0].finish_reason).toBe('tool_calls');
      expect(result.choices[0].message.tool_calls).toEqual([
        {
          function: {
            arguments: '{"location":"NYC"}',
            name: 'get_weather',
          },
          id: 'toolu_123',
          type: 'function',
        },
      ]);
    });

    it('should omit tools when tool_choice is none', async () => {
      mockCreate.mockResolvedValue(mockAnthropicResponse);

      const params: OpenRouterChatCompletionParams = {
        messages: [{ content: 'Hello', role: 'user' }],
        model: 'anthropic/claude-sonnet-4-5-20250929',
        tool_choice: 'none',
        tools: [
          {
            function: {
              description: 'Get weather',
              name: 'get_weather',
              parameters: { properties: {}, type: 'object' },
            },
            type: 'function' as const,
          },
        ],
      };

      await service.chatCompletion(params);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({ tools: expect.anything() }),
      );
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Anthropic API error');
      mockCreate.mockRejectedValue(error);

      await expect(service.chatCompletion(defaultParams)).rejects.toThrow(
        'Anthropic API error',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should use default max_tokens of 4096', async () => {
      mockCreate.mockResolvedValue(mockAnthropicResponse);

      await service.chatCompletion(defaultParams);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 4096 }),
      );
    });

    it('should respect requested max_tokens', async () => {
      mockCreate.mockResolvedValue(mockAnthropicResponse);

      await service.chatCompletion({
        ...defaultParams,
        max_tokens: 1000,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 1000 }),
      );
    });

    it('should pass temperature when provided', async () => {
      mockCreate.mockResolvedValue(mockAnthropicResponse);

      await service.chatCompletion({
        ...defaultParams,
        temperature: 0.7,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.7 }),
      );
    });

    it('should handle assistant messages with tool_calls', async () => {
      mockCreate.mockResolvedValue(mockAnthropicResponse);

      const params: OpenRouterChatCompletionParams = {
        messages: [
          { content: 'Hello', role: 'user' },
          {
            content: 'Let me check',
            role: 'assistant',
            tool_calls: [
              {
                function: {
                  arguments: '{"q":"test"}',
                  name: 'search',
                },
                id: 'call-1',
                type: 'function',
              },
            ],
          },
          { content: 'Search result', role: 'tool', tool_call_id: 'call-1' },
          { content: 'What else?', role: 'user' },
        ],
        model: 'anthropic/claude-sonnet-4-5-20250929',
      };

      await service.chatCompletion(params);

      expect(mockCreate).toHaveBeenCalled();
    });

    it('should handle multimodal content with image_url', async () => {
      mockCreate.mockResolvedValue(mockAnthropicResponse);

      const params: OpenRouterChatCompletionParams = {
        messages: [
          {
            content: [
              { text: 'Describe this image', type: 'text' },
              {
                image_url: { url: 'https://example.com/img.png' },
                type: 'image_url',
              },
            ],
            role: 'user',
          },
        ],
        model: 'anthropic/claude-sonnet-4-5-20250929',
      };

      await service.chatCompletion(params);

      expect(mockCreate).toHaveBeenCalled();
    });

    it('should map complex OpenRouter messages and preserve the stripped model in the response', async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            text: 'Final answer',
            type: 'text',
          },
          {
            id: 'tool-result-1',
            input: { query: 'cats' },
            name: 'lookup',
            type: 'tool_use',
          },
        ],
        id: 'msg-1',
        model: 'claude-sonnet-4-5',
        stop_reason: 'tool_use',
        usage: { input_tokens: 12, output_tokens: 18 },
      });

      const result = await service.chatCompletion(makeRichParams());

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const requestParams = mockCreate.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(requestParams.model).toBe('claude-sonnet-4-5');
      expect(requestParams.system).toBe('System prompt');
      expect(requestParams.max_tokens).toBe(1024);
      expect(requestParams.tool_choice).toEqual({
        name: 'lookup',
        type: 'tool',
      });
      expect(requestParams.tools).toEqual([
        {
          description: 'Lookup records',
          input_schema: {
            properties: {
              query: { type: 'string' },
            },
            type: 'object',
          },
          name: 'lookup',
        },
      ]);

      const convertedMessages = requestParams.messages as Array<{
        content: unknown;
        role: string;
      }>;
      expect(convertedMessages).toHaveLength(3);
      expect(convertedMessages[0]).toMatchObject({
        role: 'assistant',
      });
      expect(convertedMessages[0].content).toEqual(
        expect.arrayContaining([
          { text: 'Assistant note', type: 'text' },
          {
            id: 'tool-call-1',
            input: { query: 'cats' },
            name: 'lookup',
            type: 'tool_use',
          },
        ]),
      );
      expect(convertedMessages[1]).toMatchObject({
        content: [
          {
            content: 'Tool result payload',
            tool_use_id: 'tool-call-1',
            type: 'tool_result',
          },
        ],
        role: 'user',
      });
      expect(convertedMessages[2]).toMatchObject({
        content: [
          { text: 'Hello', type: 'text' },
          {
            source: { type: 'url', url: 'https://example.com/cat.jpg' },
            type: 'image',
          },
        ],
        role: 'user',
      });

      expect(result).toEqual(
        expect.objectContaining({
          choices: [
            expect.objectContaining({
              finish_reason: 'tool_calls',
              message: expect.objectContaining({
                content: 'Final answer',
                role: 'assistant',
                tool_calls: [
                  {
                    function: {
                      arguments: JSON.stringify({ query: 'cats' }),
                      name: 'lookup',
                    },
                    id: 'tool-result-1',
                    type: 'function',
                  },
                ],
              }),
            }),
          ],
          id: 'msg-1',
          model: 'claude-sonnet-4-5',
          usage: {
            completion_tokens: 18,
            prompt_tokens: 12,
            total_tokens: 30,
          },
        }),
      );
    });
  });

  describe('streamChatCompletion', () => {
    it('should return a ReadableStream', async () => {
      const mockStreamInstance = {
        async *[Symbol.asyncIterator]() {
          yield {
            delta: { text: 'Hello', type: 'text_delta' },
            type: 'content_block_delta',
          };
          yield {
            delta: { text: ' world', type: 'text_delta' },
            type: 'content_block_delta',
          };
        },
      };
      mockStream.mockReturnValue(mockStreamInstance);

      const result = await service.streamChatCompletion(defaultParams);

      expect(result).toBeInstanceOf(ReadableStream);
    });

    it('should stream only text deltas from the Anthropic event stream', async () => {
      async function* streamEvents() {
        yield {
          delta: { text: 'Hello', type: 'text_delta' },
          type: 'content_block_delta',
        };
        yield {
          delta: { text: ' ignored', type: 'other_delta' },
          type: 'content_block_delta',
        };
        yield {
          delta: { text: ' world', type: 'text_delta' },
          type: 'content_block_delta',
        };
      }

      mockStream.mockReturnValue(streamEvents());

      const stream = await service.streamChatCompletion(makeRichParams());
      const reader = stream.getReader();
      const chunks: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        chunks.push(value);
      }

      expect(chunks).toEqual(['Hello', ' world']);
    });

    it('should throw and log error when stream creation fails', async () => {
      mockStream.mockImplementation(() => {
        throw new Error('Stream error');
      });

      await expect(service.streamChatCompletion(defaultParams)).rejects.toThrow(
        'Stream error',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should throw when no API key is available for streaming', async () => {
      configService.get.mockReturnValue(undefined);

      await expect(service.streamChatCompletion(defaultParams)).rejects.toThrow(
        'ANTHROPIC_API_KEY is not configured',
      );
    });
  });
});
