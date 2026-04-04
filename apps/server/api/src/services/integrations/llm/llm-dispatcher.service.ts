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
import { Injectable } from '@nestjs/common';

type LlmProvider = 'anthropic' | 'openai' | 'openrouter' | 'local';

@Injectable()
export class LlmDispatcherService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly anthropicService: AnthropicService,
    private readonly openAiLlmService: OpenAiLlmService,
    private readonly openAiOAuthService: OpenAiOAuthService,
    private readonly openRouterService: OpenRouterService,
    private readonly byokService: ByokService,
    private readonly llmInstanceService: LlmInstanceService,
  ) {}

  /**
   * Determine the LLM provider based on model prefix.
   */
  private resolveProvider(model: string): LlmProvider {
    if (model.startsWith('local/')) {
      return 'local';
    }

    if (model.startsWith('anthropic/')) {
      return 'anthropic';
    }

    if (model.startsWith('openai/')) {
      return 'openai';
    }

    // Everything else (deepseek/, x-ai/, google/, etc.) routes through OpenRouter
    return 'openrouter';
  }

  /**
   * Resolve the BYOK provider enum for a given LLM provider.
   */
  private resolveByokProvider(provider: LlmProvider): ByokProvider {
    switch (provider) {
      case 'anthropic':
        return ByokProvider.ANTHROPIC;
      case 'openai':
        return ByokProvider.OPENAI;
      default:
        return ByokProvider.OPENROUTER;
    }
  }

  /**
   * Resolve the API key for a provider, handling OAuth token refresh if needed.
   */
  private async resolveApiKey(
    organizationId: string,
    provider: LlmProvider,
  ): Promise<string | undefined> {
    const byokProvider = this.resolveByokProvider(provider);
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      byokProvider,
    );

    if (!byokKey) {
      return undefined;
    }

    // OAuth tokens are used as-is; if expired, the 401 retry in
    // chatCompletion() handles refresh via tryRefreshAndRetry().
    return byokKey.apiKey;
  }

  /**
   * Chat completion with automatic provider routing and BYOK key resolution.
   */
  async chatCompletion(
    params: OpenRouterChatCompletionParams,
    organizationId?: string,
  ): Promise<OpenRouterChatCompletionResponse> {
    const provider = this.resolveProvider(params.model);

    // Local vLLM — bypass BYOK, ensure instance is running, route directly
    if (provider === 'local') {
      return this.callLocalProvider(params);
    }

    let apiKeyOverride: string | undefined;

    // Resolve BYOK key if organization context is available
    if (organizationId) {
      apiKeyOverride = await this.resolveApiKey(organizationId, provider);

      if (apiKeyOverride) {
        this.loggerService.log(
          `${this.constructorName}: Using BYOK key for ${provider}`,
        );
      }
    }

    this.loggerService.log(
      `${this.constructorName}: Routing ${params.model} → ${provider}`,
    );

    try {
      return await this.callProvider(provider, params, apiKeyOverride);
    } catch (error: unknown) {
      // If we get a 401 with an OAuth token, try refreshing and retrying once
      if (
        organizationId &&
        provider === 'openai' &&
        apiKeyOverride &&
        this.isUnauthorizedError(error)
      ) {
        const refreshedKey = await this.tryRefreshAndRetry(organizationId);
        if (refreshedKey) {
          this.loggerService.log(
            `${this.constructorName}: Retrying after token refresh`,
          );
          return this.callProvider(provider, params, refreshedKey);
        }
      }
      throw error;
    }
  }

  /**
   * Streaming chat completion with automatic provider routing and BYOK key resolution.
   */
  async streamChatCompletion(
    params: OpenRouterChatCompletionParams,
    organizationId?: string,
  ): Promise<ReadableStream<string>> {
    const provider = this.resolveProvider(params.model);

    // Local vLLM — bypass BYOK, route directly
    if (provider === 'local') {
      return this.openAiLlmService.streamChatCompletion(
        params,
        undefined,
        String(this.configService.get('GPU_LLM_URL') || ''),
      );
    }

    let apiKeyOverride: string | undefined;

    if (organizationId) {
      apiKeyOverride = await this.resolveApiKey(organizationId, provider);
    }

    switch (provider) {
      case 'anthropic':
        return this.anthropicService.streamChatCompletion(
          params,
          apiKeyOverride,
        );
      case 'openai':
        return this.openAiLlmService.streamChatCompletion(
          params,
          apiKeyOverride,
        );
      default:
        return this.openRouterService.streamChatCompletion(
          params,
          apiKeyOverride,
        );
    }
  }

  private async callProvider(
    provider: LlmProvider,
    params: OpenRouterChatCompletionParams,
    apiKeyOverride?: string,
  ): Promise<OpenRouterChatCompletionResponse> {
    switch (provider) {
      case 'anthropic':
        return this.anthropicService.chatCompletion(params, apiKeyOverride);
      case 'openai':
        return this.openAiLlmService.chatCompletion(params, apiKeyOverride);
      default:
        return this.openRouterService.chatCompletion(params, apiKeyOverride);
    }
  }

  /**
   * Route to local vLLM instance (OpenAI-compatible API).
   * Starts the EC2 instance if stopped, waits for health, then calls vLLM.
   * Falls back to deepseek if GPU_LLM_URL is not configured.
   */
  private async callLocalProvider(
    params: OpenRouterChatCompletionParams,
  ): Promise<OpenRouterChatCompletionResponse> {
    const llmUrl = String(this.configService.get('GPU_LLM_URL') || '');

    if (!llmUrl) {
      this.loggerService.warn(
        `${this.constructorName}: GPU_LLM_URL not configured — falling back to deepseek/deepseek-chat`,
      );
      return this.openRouterService.chatCompletion({
        ...params,
        model: 'deepseek/deepseek-chat',
      });
    }

    this.loggerService.log(
      `${this.constructorName}: Routing ${params.model} → local vLLM at ${llmUrl}`,
    );

    await this.llmInstanceService.ensureRunning();

    return this.openAiLlmService.chatCompletion(
      params,
      undefined,
      `${llmUrl}/v1`,
    );
  }

  private isUnauthorizedError(error: unknown): boolean {
    const err = error as { status?: number; response?: { status?: number } };
    return err?.status === 401 || err?.response?.status === 401;
  }

  /**
   * Attempt to refresh OAuth token and return the new access token.
   */
  private async tryRefreshAndRetry(
    organizationId: string,
  ): Promise<string | undefined> {
    try {
      const byokKey = await this.byokService.resolveApiKey(
        organizationId,
        ByokProvider.OPENAI,
      );

      if (!byokKey?.apiSecret) {
        return undefined;
      }

      const tokens = await this.openAiOAuthService.refreshAccessToken(
        byokKey.apiSecret,
      );

      // Update stored tokens
      await this.byokService.updateOAuthTokens(
        organizationId,
        ByokProvider.OPENAI,
        tokens.access_token,
        tokens.refresh_token,
        Date.now() + tokens.expires_in * 1000,
      );

      return tokens.access_token;
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}: OAuth token refresh failed`,
        error,
      );
      return undefined;
    }
  }
}
