import { ByokService } from '@api/services/byok/byok.service';
import { AnthropicService } from '@api/services/integrations/anthropic/services/anthropic.service';
import { LlmInstanceService } from '@api/services/integrations/llm/llm-instance.service';
import { OpenAiLlmService } from '@api/services/integrations/openai-llm/services/openai-llm.service';
import { OpenAiOAuthService } from '@api/services/integrations/openai-llm/services/openai-oauth.service';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { ByokProvider } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmCompletionTelemetryService } from './llm-completion-telemetry.service';
import { LlmDispatcherService } from './llm-dispatcher.service';

describe('LlmDispatcherService', () => {
  let service: LlmDispatcherService;
  let anthropicService: {
    chatCompletion: ReturnType<typeof vi.fn>;
    streamChatCompletion: ReturnType<typeof vi.fn>;
    streamChatCompletionAggregated: ReturnType<typeof vi.fn>;
  };
  let openAiLlmService: {
    chatCompletion: ReturnType<typeof vi.fn>;
    streamChatCompletion: ReturnType<typeof vi.fn>;
    streamChatCompletionAggregated: ReturnType<typeof vi.fn>;
  };
  let openAiOAuthService: { refreshAccessToken: ReturnType<typeof vi.fn> };
  let openRouterService: {
    chatCompletion: ReturnType<typeof vi.fn>;
    streamChatCompletion: ReturnType<typeof vi.fn>;
    streamChatCompletionAggregated: ReturnType<typeof vi.fn>;
  };
  let byokService: {
    resolveApiKey: ReturnType<typeof vi.fn>;
    updateOAuthTokens: ReturnType<typeof vi.fn>;
  };
  let llmInstanceService: { ensureRunning: ReturnType<typeof vi.fn> };
  let llmCompletionTelemetryService: {
    beginWorkflowOperation: ReturnType<typeof vi.fn>;
    recordCompletion: ReturnType<typeof vi.fn>;
  };
  let configService: { get: ReturnType<typeof vi.fn> };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const orgId = 'test-object-id';

  const mockResponse: OpenRouterChatCompletionResponse = {
    choices: [
      {
        finish_reason: 'stop',
        message: { content: 'Hello!', role: 'assistant' },
      },
    ],
    id: 'gen-123',
    model: 'test-model',
    usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 },
  };

  const makeParams = (model: string): OpenRouterChatCompletionParams => ({
    messages: [{ content: 'Hello', role: 'user' }],
    model,
  });

  beforeEach(async () => {
    anthropicService = {
      chatCompletion: vi.fn().mockResolvedValue(mockResponse),
      streamChatCompletion: vi.fn().mockResolvedValue(new ReadableStream()),
      streamChatCompletionAggregated: vi.fn().mockResolvedValue(mockResponse),
    };
    openAiLlmService = {
      chatCompletion: vi.fn().mockResolvedValue(mockResponse),
      streamChatCompletion: vi.fn().mockResolvedValue(new ReadableStream()),
      streamChatCompletionAggregated: vi.fn().mockResolvedValue(mockResponse),
    };
    openAiOAuthService = {
      refreshAccessToken: vi.fn(),
    };
    openRouterService = {
      chatCompletion: vi.fn().mockResolvedValue(mockResponse),
      streamChatCompletion: vi.fn().mockResolvedValue(new ReadableStream()),
      streamChatCompletionAggregated: vi.fn().mockResolvedValue(mockResponse),
    };
    byokService = {
      resolveApiKey: vi.fn().mockResolvedValue(null),
      updateOAuthTokens: vi.fn(),
    };
    llmInstanceService = {
      ensureRunning: vi.fn().mockResolvedValue(undefined),
    };
    llmCompletionTelemetryService = {
      beginWorkflowOperation: vi.fn().mockResolvedValue(undefined),
      recordCompletion: vi.fn().mockResolvedValue(undefined),
    };
    // Platform keys present by default so openai/* and anthropic/* prefer
    // native clients. Tests that assert OpenRouter fallback clear these.
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') {
          return 'sk-ant-test';
        }
        if (key === 'OPENAI_API_KEY') {
          return 'sk-oai-test';
        }
        if (key === 'OPENROUTER_API_KEY') {
          return 'sk-or-test';
        }
        return '';
      }),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmDispatcherService,
        { provide: AnthropicService, useValue: anthropicService },
        { provide: OpenAiLlmService, useValue: openAiLlmService },
        { provide: OpenAiOAuthService, useValue: openAiOAuthService },
        { provide: OpenRouterService, useValue: openRouterService },
        { provide: ByokService, useValue: byokService },
        { provide: LlmInstanceService, useValue: llmInstanceService },
        {
          provide: LlmCompletionTelemetryService,
          useValue: llmCompletionTelemetryService,
        },
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<LlmDispatcherService>(LlmDispatcherService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chatCompletion — provider routing', () => {
    it('should route anthropic/ models to AnthropicService', async () => {
      const result = await service.chatCompletion(
        makeParams('anthropic/claude-sonnet-5'),
      );

      expect(anthropicService.chatCompletion).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should route openai/ models to OpenAiLlmService when OPENAI_API_KEY is set', async () => {
      await service.chatCompletion(makeParams('openai/gpt-5.6-terra'));

      expect(openAiLlmService.chatCompletion).toHaveBeenCalled();
      expect(openRouterService.chatCompletion).not.toHaveBeenCalled();
    });

    it('should route openai/ models via OpenRouter when OPENAI_API_KEY is missing', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'OPENROUTER_API_KEY' ? 'sk-or-test' : '',
      );

      await service.chatCompletion(makeParams('openai/gpt-5.6-terra'));

      expect(openRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'openai/gpt-5.6-terra' }),
        undefined,
      );
      expect(openAiLlmService.chatCompletion).not.toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('No openai key — routing'),
      );
    });

    it('should route deepseek/ models to OpenRouterService', async () => {
      await service.chatCompletion(
        makeParams('deepseek/deepseek-v4-flash-0731'),
      );

      expect(openRouterService.chatCompletion).toHaveBeenCalled();
    });

    it('should route google/ models to OpenRouterService', async () => {
      await service.chatCompletion(makeParams('google/gemini-2.5-pro'));

      expect(openRouterService.chatCompletion).toHaveBeenCalled();
    });

    it('should route x-ai/ models to OpenRouterService', async () => {
      await service.chatCompletion(makeParams('x-ai/grok-3'));

      expect(openRouterService.chatCompletion).toHaveBeenCalled();
    });

    it('falls back from the experimental Free router to DeepSeek on capability failure', async () => {
      openRouterService.chatCompletion
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({
          ...mockResponse,
          model: 'deepseek/deepseek-v4-flash-0731',
          usage: { ...mockResponse.usage, cost: 0.001 },
        });

      const result = await service.chatCompletion(
        makeParams('openrouter/free'),
        orgId,
      );

      expect(openRouterService.chatCompletion).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: 'deepseek/deepseek-v4-flash-0731' }),
        undefined,
      );
      expect(result.model).toBe('deepseek/deepseek-v4-flash-0731');
    });
  });

  describe('chatCompletion — local provider', () => {
    it('should fall back to deepseek when GPU_LLM_URL is not configured', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'OPENROUTER_API_KEY' ? 'sk-or-test' : '',
      );

      await service.chatCompletion(makeParams('local/my-model'));

      expect(openRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'deepseek/deepseek-v4-flash-0731' }),
      );
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('should use local vLLM when GPU_LLM_URL is configured', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'GPU_LLM_URL' ? 'http://10.0.0.10:8000' : '',
      );

      await service.chatCompletion(makeParams('local/my-model'));

      expect(llmInstanceService.ensureRunning).toHaveBeenCalled();
      expect(openAiLlmService.chatCompletion).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        'http://10.0.0.10:8000/v1',
      );
    });
  });

  describe('chatCompletion — BYOK key resolution', () => {
    it('should resolve BYOK key when organizationId is provided', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'byok-key' });

      await service.chatCompletion(
        makeParams('anthropic/claude-sonnet-5'),
        orgId,
      );

      expect(byokService.resolveApiKey).toHaveBeenCalledWith(
        orgId,
        ByokProvider.ANTHROPIC,
      );
      expect(anthropicService.chatCompletion).toHaveBeenCalledWith(
        expect.any(Object),
        'byok-key',
      );
    });

    it('should resolve OpenAI BYOK provider for openai/ models', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'oai-key' });

      await service.chatCompletion(makeParams('openai/gpt-5.6-terra'), orgId);

      expect(byokService.resolveApiKey).toHaveBeenCalledWith(
        orgId,
        ByokProvider.OPENAI,
      );
    });

    it('should resolve OpenRouter BYOK provider for other models', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'or-key' });

      await service.chatCompletion(
        makeParams('deepseek/deepseek-v4-flash-0731'),
        orgId,
      );

      expect(byokService.resolveApiKey).toHaveBeenCalledWith(
        orgId,
        ByokProvider.OPENROUTER,
      );
    });

    it('should not resolve BYOK when no organizationId', async () => {
      await service.chatCompletion(makeParams('anthropic/claude-sonnet-5'));

      expect(byokService.resolveApiKey).not.toHaveBeenCalled();
    });

    it('should pass undefined apiKeyOverride when BYOK returns null but platform key exists', async () => {
      byokService.resolveApiKey.mockResolvedValue(null);

      await service.chatCompletion(
        makeParams('anthropic/claude-sonnet-5'),
        orgId,
      );

      expect(anthropicService.chatCompletion).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
      );
    });

    it('should fall back to OpenRouter BYOK when openai platform key and OpenAI BYOK are missing', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'OPENROUTER_API_KEY' ? 'sk-or-test' : '',
      );
      byokService.resolveApiKey.mockImplementation(
        async (_org: string, provider: ByokProvider) => {
          if (provider === ByokProvider.OPENROUTER) {
            return { apiKey: 'or-byok' };
          }
          return null;
        },
      );

      await service.chatCompletion(makeParams('openai/gpt-5.6-terra'), orgId);

      expect(byokService.resolveApiKey).toHaveBeenCalledWith(
        orgId,
        ByokProvider.OPENAI,
      );
      expect(byokService.resolveApiKey).toHaveBeenCalledWith(
        orgId,
        ByokProvider.OPENROUTER,
      );
      expect(openRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'openai/gpt-5.6-terra' }),
        'or-byok',
      );
    });
  });

  describe('chatCompletion — OAuth token refresh', () => {
    it('should retry with refreshed token on 401 for OpenAI with BYOK', async () => {
      byokService.resolveApiKey
        .mockResolvedValueOnce({
          apiKey: 'old-token',
          apiSecret: 'refresh-token',
        })
        .mockResolvedValueOnce({
          apiKey: 'old-token',
          apiSecret: 'refresh-token',
        });
      openAiLlmService.chatCompletion
        .mockRejectedValueOnce({ status: 401 })
        .mockResolvedValueOnce(mockResponse);
      openAiOAuthService.refreshAccessToken.mockResolvedValue({
        access_token: 'new-token',
        expires_in: 3600,
        refresh_token: 'new-refresh',
      });

      const result = await service.chatCompletion(
        makeParams('openai/gpt-5.6-terra'),
        orgId,
      );

      expect(openAiOAuthService.refreshAccessToken).toHaveBeenCalled();
      expect(byokService.updateOAuthTokens).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should not attempt refresh for non-OpenAI providers', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'key' });
      anthropicService.chatCompletion.mockRejectedValue({ status: 401 });

      await expect(
        service.chatCompletion(makeParams('anthropic/claude-sonnet-5'), orgId),
      ).rejects.toEqual({ status: 401 });

      expect(openAiOAuthService.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('should rethrow if refresh fails', async () => {
      byokService.resolveApiKey.mockResolvedValue({
        apiKey: 'old-token',
        apiSecret: 'refresh-token',
      });
      openAiLlmService.chatCompletion.mockRejectedValue({
        status: 401,
      });
      openAiOAuthService.refreshAccessToken.mockRejectedValue(
        new Error('Refresh failed'),
      );

      await expect(
        service.chatCompletion(makeParams('openai/gpt-5.6-terra'), orgId),
      ).rejects.toEqual({ status: 401 });

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('OAuth token refresh failed'),
        expect.any(Error),
      );
    });
  });

  describe('streamChatCompletion', () => {
    it('should route anthropic/ models to AnthropicService for streaming', async () => {
      await service.streamChatCompletion(
        makeParams('anthropic/claude-sonnet-5'),
      );

      expect(anthropicService.streamChatCompletion).toHaveBeenCalled();
    });

    it('should route openai/ models to OpenAiLlmService for streaming', async () => {
      await service.streamChatCompletion(makeParams('openai/gpt-5.6-terra'));

      expect(openAiLlmService.streamChatCompletion).toHaveBeenCalled();
    });

    it('should route other models to OpenRouterService for streaming', async () => {
      await service.streamChatCompletion(
        makeParams('deepseek/deepseek-v4-flash-0731'),
      );

      expect(openRouterService.streamChatCompletion).toHaveBeenCalled();
    });

    it('should route local/ models to OpenAiLlmService with GPU URL for streaming', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'GPU_LLM_URL' ? 'http://10.0.0.10:8000' : '',
      );

      await service.streamChatCompletion(makeParams('local/my-model'));

      expect(openAiLlmService.streamChatCompletion).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        'http://10.0.0.10:8000',
      );
    });

    it('should resolve BYOK key for streaming when organizationId is provided', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'byok-key' });

      await service.streamChatCompletion(
        makeParams('anthropic/claude-sonnet-5'),
        orgId,
      );

      expect(anthropicService.streamChatCompletion).toHaveBeenCalledWith(
        expect.any(Object),
        'byok-key',
      );
    });
  });

  describe('streamChatCompletionAggregated', () => {
    it('should route anthropic/ models to AnthropicService', async () => {
      const result = await service.streamChatCompletionAggregated(
        makeParams('anthropic/claude-sonnet-5'),
      );

      expect(
        anthropicService.streamChatCompletionAggregated,
      ).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should route openai/ models to OpenAiLlmService', async () => {
      await service.streamChatCompletionAggregated(
        makeParams('openai/gpt-5.6-terra'),
      );

      expect(
        openAiLlmService.streamChatCompletionAggregated,
      ).toHaveBeenCalled();
    });

    it('should route other models to OpenRouterService', async () => {
      await service.streamChatCompletionAggregated(
        makeParams('deepseek/deepseek-v4-flash-0731'),
      );

      expect(
        openRouterService.streamChatCompletionAggregated,
      ).toHaveBeenCalled();
    });

    it('should forward the onToken callback to the provider', async () => {
      const onToken = vi.fn();

      await service.streamChatCompletionAggregated(
        makeParams('anthropic/claude-sonnet-5'),
        undefined,
        onToken,
      );

      expect(
        anthropicService.streamChatCompletionAggregated,
      ).toHaveBeenCalledWith(expect.any(Object), undefined, onToken);
    });

    it('should warm and stream local/ models via GPU vLLM URL', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'GPU_LLM_URL' ? 'http://10.0.0.10:8000' : '',
      );
      const onToken = vi.fn();

      await service.streamChatCompletionAggregated(
        makeParams('local/my-model'),
        undefined,
        onToken,
      );

      expect(llmInstanceService.ensureRunning).toHaveBeenCalled();
      expect(
        openAiLlmService.streamChatCompletionAggregated,
      ).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        onToken,
        'http://10.0.0.10:8000/v1',
      );
    });

    it('should fall back to deepseek streaming when GPU_LLM_URL is unset', async () => {
      configService.get.mockReturnValue('');

      await service.streamChatCompletionAggregated(
        makeParams('local/my-model'),
      );

      expect(
        openRouterService.streamChatCompletionAggregated,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'deepseek/deepseek-v4-flash-0731' }),
        undefined,
        undefined,
      );
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('should resolve BYOK key when organizationId is provided', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'byok-key' });

      await service.streamChatCompletionAggregated(
        makeParams('anthropic/claude-sonnet-5'),
        orgId,
      );

      expect(
        anthropicService.streamChatCompletionAggregated,
      ).toHaveBeenCalledWith(expect.any(Object), 'byok-key', undefined);
    });
  });

  describe('completion telemetry wrapper', () => {
    it('records exact OpenRouter vendor cost and actual routed model', async () => {
      openRouterService.chatCompletion.mockResolvedValue({
        ...mockResponse,
        model: 'openai/gpt-5.6-terra',
        usage: { ...mockResponse.usage, cost: 0.012345 },
      });

      await service.chatCompletion(makeParams('openrouter/auto'), orgId);

      expect(
        llmCompletionTelemetryService.recordCompletion,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'openai/gpt-5.6-terra',
          vendorCostMicros: 12_345,
        }),
      );
    });
    it('emits one telemetry event per chatCompletion without prompt content', async () => {
      await service.chatCompletion(
        makeParams('deepseek/deepseek-v4-flash-0731'),
        orgId,
        { brandId: 'brand-1', runId: 'run-1', threadId: 'thread-1' },
      );

      expect(
        llmCompletionTelemetryService.recordCompletion,
      ).toHaveBeenCalledOnce();
      expect(
        llmCompletionTelemetryService.recordCompletion,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          completionTokens: 5,
          isByok: false,
          model: 'test-model',
          organizationId: orgId,
          promptTokens: 10,
          provider: 'openrouter',
          runId: 'run-1',
          threadId: 'thread-1',
        }),
      );

      const payload = JSON.stringify(
        llmCompletionTelemetryService.recordCompletion.mock.calls,
      );
      expect(payload).not.toContain('Hello');
      expect(payload).not.toContain('Hello!');
      expect(payload).not.toContain('"messages"');
      expect(payload).not.toContain('"content"');
    });

    it('marks BYOK completions with isByok and still records tokens', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'byok-key' });

      await service.chatCompletion(
        makeParams('anthropic/claude-sonnet-5'),
        orgId,
      );

      expect(
        llmCompletionTelemetryService.recordCompletion,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          isByok: true,
          promptTokens: 10,
          completionTokens: 5,
          provider: 'anthropic',
        }),
      );
    });

    it('emits one telemetry event per aggregated stream completion', async () => {
      await service.streamChatCompletionAggregated(
        makeParams('openai/gpt-5.6-terra'),
        orgId,
        undefined,
        { runId: 'run-2', threadId: 'thread-2' },
      );

      expect(
        llmCompletionTelemetryService.recordCompletion,
      ).toHaveBeenCalledOnce();
      expect(
        llmCompletionTelemetryService.recordCompletion,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          isByok: false,
          organizationId: orgId,
          provider: 'openai',
          runId: 'run-2',
          threadId: 'thread-2',
        }),
      );
    });
  });
});
