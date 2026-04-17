import { ConfigService } from '@api/config/config.service';
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
import { ByokProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmDispatcherService } from './llm-dispatcher.service';

describe('LlmDispatcherService', () => {
  let service: LlmDispatcherService;
  let anthropicService: {
    chatCompletion: ReturnType<typeof vi.fn>;
    streamChatCompletion: ReturnType<typeof vi.fn>;
  };
  let openAiLlmService: {
    chatCompletion: ReturnType<typeof vi.fn>;
    streamChatCompletion: ReturnType<typeof vi.fn>;
  };
  let openAiOAuthService: { refreshAccessToken: ReturnType<typeof vi.fn> };
  let openRouterService: {
    chatCompletion: ReturnType<typeof vi.fn>;
    streamChatCompletion: ReturnType<typeof vi.fn>;
  };
  let byokService: {
    resolveApiKey: ReturnType<typeof vi.fn>;
    updateOAuthTokens: ReturnType<typeof vi.fn>;
  };
  let llmInstanceService: { ensureRunning: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const orgId = 'test-object-id'.toHexString();

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
    };
    openAiLlmService = {
      chatCompletion: vi.fn().mockResolvedValue(mockResponse),
      streamChatCompletion: vi.fn().mockResolvedValue(new ReadableStream()),
    };
    openAiOAuthService = {
      refreshAccessToken: vi.fn(),
    };
    openRouterService = {
      chatCompletion: vi.fn().mockResolvedValue(mockResponse),
      streamChatCompletion: vi.fn().mockResolvedValue(new ReadableStream()),
    };
    byokService = {
      resolveApiKey: vi.fn().mockResolvedValue(null),
      updateOAuthTokens: vi.fn(),
    };
    llmInstanceService = {
      ensureRunning: vi.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: vi.fn().mockReturnValue(''),
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
        makeParams('anthropic/claude-sonnet-4-5-20250929'),
      );

      expect(anthropicService.chatCompletion).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should route openai/ models to OpenAiLlmService', async () => {
      await service.chatCompletion(makeParams('openai/gpt-4o'));

      expect(openAiLlmService.chatCompletion).toHaveBeenCalled();
    });

    it('should route deepseek/ models to OpenRouterService', async () => {
      await service.chatCompletion(makeParams('deepseek/deepseek-chat'));

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
  });

  describe('chatCompletion — local provider', () => {
    it('should fall back to deepseek when GPU_LLM_URL is not configured', async () => {
      configService.get.mockReturnValue('');

      await service.chatCompletion(makeParams('local/my-model'));

      expect(openRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'deepseek/deepseek-chat' }),
      );
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('should use local vLLM when GPU_LLM_URL is configured', async () => {
      configService.get.mockReturnValue('http://10.0.0.10:8000');

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
        makeParams('anthropic/claude-sonnet-4-5-20250929'),
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

      await service.chatCompletion(makeParams('openai/gpt-4o'), orgId);

      expect(byokService.resolveApiKey).toHaveBeenCalledWith(
        orgId,
        ByokProvider.OPENAI,
      );
    });

    it('should resolve OpenRouter BYOK provider for other models', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'or-key' });

      await service.chatCompletion(makeParams('deepseek/deepseek-chat'), orgId);

      expect(byokService.resolveApiKey).toHaveBeenCalledWith(
        orgId,
        ByokProvider.OPENROUTER,
      );
    });

    it('should not resolve BYOK when no organizationId', async () => {
      await service.chatCompletion(
        makeParams('anthropic/claude-sonnet-4-5-20250929'),
      );

      expect(byokService.resolveApiKey).not.toHaveBeenCalled();
    });

    it('should pass undefined apiKeyOverride when BYOK returns null', async () => {
      byokService.resolveApiKey.mockResolvedValue(null);

      await service.chatCompletion(
        makeParams('anthropic/claude-sonnet-4-5-20250929'),
        orgId,
      );

      expect(anthropicService.chatCompletion).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
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
        makeParams('openai/gpt-4o'),
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
        service.chatCompletion(
          makeParams('anthropic/claude-sonnet-4-5-20250929'),
          orgId,
        ),
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
        service.chatCompletion(makeParams('openai/gpt-4o'), orgId),
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
        makeParams('anthropic/claude-sonnet-4-5-20250929'),
      );

      expect(anthropicService.streamChatCompletion).toHaveBeenCalled();
    });

    it('should route openai/ models to OpenAiLlmService for streaming', async () => {
      await service.streamChatCompletion(makeParams('openai/gpt-4o'));

      expect(openAiLlmService.streamChatCompletion).toHaveBeenCalled();
    });

    it('should route other models to OpenRouterService for streaming', async () => {
      await service.streamChatCompletion(makeParams('deepseek/deepseek-chat'));

      expect(openRouterService.streamChatCompletion).toHaveBeenCalled();
    });

    it('should route local/ models to OpenAiLlmService with GPU URL for streaming', async () => {
      configService.get.mockReturnValue('http://10.0.0.10:8000');

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
        makeParams('anthropic/claude-sonnet-4-5-20250929'),
        orgId,
      );

      expect(anthropicService.streamChatCompletion).toHaveBeenCalledWith(
        expect.any(Object),
        'byok-key',
      );
    });
  });
});
