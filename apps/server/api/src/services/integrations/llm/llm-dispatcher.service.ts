import { ByokService } from '@api/services/byok/byok.service';
import { AnthropicService } from '@api/services/integrations/anthropic/services/anthropic.service';
import { LlmCompletionTelemetryService } from '@api/services/integrations/llm/llm-completion-telemetry.service';
import { LlmInstanceService } from '@api/services/integrations/llm/llm-instance.service';
import { OpenAiLlmService } from '@api/services/integrations/openai-llm/services/openai-llm.service';
import { OpenAiOAuthService } from '@api/services/integrations/openai-llm/services/openai-oauth.service';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
  OpenRouterStreamTokenHandler,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { AGENT_CHAT_MODEL_KEYS, LLM_DEFAULTS } from '@genfeedai/constants';
import { ByokProvider } from '@genfeedai/enums';
import type { ILlmCompletionCallContext } from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type LlmProvider = 'anthropic' | 'openai' | 'openrouter' | 'local';

/**
 * Stand-in when a `local/` model is requested but no GPU fleet is configured.
 * Cheapest catalogued model on purpose — the caller asked for self-hosted
 * inference and is not expecting a frontier bill.
 */
const SELF_HOSTED_FALLBACK_MODEL = LLM_DEFAULTS.selfHostedFallback;

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
    private readonly llmCompletionTelemetryService: LlmCompletionTelemetryService,
  ) {}

  /**
   * Preferred provider from model id prefix only (no key availability).
   */
  private preferredProviderForModel(model: string): LlmProvider {
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

  private hasPlatformKey(provider: LlmProvider): boolean {
    const envKey =
      provider === 'openai'
        ? 'OPENAI_API_KEY'
        : provider === 'anthropic'
          ? 'ANTHROPIC_API_KEY'
          : provider === 'openrouter'
            ? 'OPENROUTER_API_KEY'
            : null;

    if (!envKey) {
      return false;
    }

    const value = this.configService.get(envKey);
    return typeof value === 'string' && value.trim().length > 0;
  }

  /**
   * Pick provider + BYOK override. `openai/*` / `anthropic/*` use the native
   * client only when a platform or BYOK key exists; otherwise fall back to
   * OpenRouter (same model id — OpenRouter serves those catalogs).
   */
  private async resolveRoute(
    model: string,
    organizationId?: string,
  ): Promise<{ apiKeyOverride?: string; provider: LlmProvider }> {
    const preferred = this.preferredProviderForModel(model);

    if (preferred === 'local') {
      return { provider: 'local' };
    }

    let apiKeyOverride: string | undefined;
    if (organizationId) {
      apiKeyOverride = await this.resolveApiKey(organizationId, preferred);
    }

    if (
      preferred === 'openrouter' ||
      apiKeyOverride ||
      this.hasPlatformKey(preferred)
    ) {
      return { apiKeyOverride, provider: preferred };
    }

    let openRouterOverride: string | undefined;
    if (organizationId) {
      openRouterOverride = await this.resolveApiKey(
        organizationId,
        'openrouter',
      );
    }

    this.loggerService.log(
      `${this.constructorName}: No ${preferred} key — routing ${model} via openrouter`,
    );

    return { apiKeyOverride: openRouterOverride, provider: 'openrouter' };
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
    callContext?: ILlmCompletionCallContext,
  ): Promise<OpenRouterChatCompletionResponse> {
    const { apiKeyOverride, provider } = await this.resolveRoute(
      params.model,
      organizationId,
    );

    // Local vLLM — bypass BYOK, ensure instance is running, route directly
    if (provider === 'local') {
      return this.dispatchWithTelemetry(
        () => this.callLocalProvider(params),
        params,
        organizationId,
        provider,
        false,
        callContext,
      );
    }

    if (apiKeyOverride) {
      this.loggerService.log(
        `${this.constructorName}: Using BYOK key for ${provider}`,
      );
    }

    this.loggerService.log(
      `${this.constructorName}: Routing ${params.model} → ${provider}`,
    );

    try {
      return await this.dispatchWithTelemetry(
        () => this.callProvider(provider, params, apiKeyOverride),
        params,
        organizationId,
        provider,
        Boolean(apiKeyOverride),
        callContext,
      );
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
          return this.dispatchWithTelemetry(
            () => this.callProvider(provider, params, refreshedKey),
            params,
            organizationId,
            provider,
            true,
            callContext,
          );
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
    const { apiKeyOverride, provider } = await this.resolveRoute(
      params.model,
      organizationId,
    );

    // Local vLLM — bypass BYOK, route directly
    if (provider === 'local') {
      return this.openAiLlmService.streamChatCompletion(
        params,
        undefined,
        String(this.configService.get('GPU_LLM_URL') || ''),
      );
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

  /**
   * Real incremental streaming chat completion. Surfaces text deltas through
   * `onToken` as the model generates them and resolves with the same
   * OpenRouter-shaped aggregated response `chatCompletion` returns (text +
   * tool calls + usage), so the caller's tool loop and accounting are
   * unchanged. Reuses the same provider routing, BYOK resolution, local-vLLM
   * warm-up, and 401-refresh behaviour as `chatCompletion`.
   */
  async streamChatCompletionAggregated(
    params: OpenRouterChatCompletionParams,
    organizationId?: string,
    onToken?: OpenRouterStreamTokenHandler,
    callContext?: ILlmCompletionCallContext,
  ): Promise<OpenRouterChatCompletionResponse> {
    const { apiKeyOverride, provider } = await this.resolveRoute(
      params.model,
      organizationId,
    );

    if (provider === 'local') {
      return this.dispatchWithTelemetry(
        () => this.callLocalProviderStreaming(params, onToken),
        params,
        organizationId,
        provider,
        false,
        callContext,
      );
    }

    if (apiKeyOverride) {
      this.loggerService.log(
        `${this.constructorName}: Using BYOK key for ${provider} (streaming)`,
      );
    }

    this.loggerService.log(
      `${this.constructorName}: Streaming ${params.model} → ${provider}`,
    );

    try {
      return await this.dispatchWithTelemetry(
        () =>
          this.callProviderStreaming(provider, params, apiKeyOverride, onToken),
        params,
        organizationId,
        provider,
        Boolean(apiKeyOverride),
        callContext,
      );
    } catch (error: unknown) {
      if (
        organizationId &&
        provider === 'openai' &&
        apiKeyOverride &&
        this.isUnauthorizedError(error)
      ) {
        const refreshedKey = await this.tryRefreshAndRetry(organizationId);
        if (refreshedKey) {
          this.loggerService.log(
            `${this.constructorName}: Retrying stream after token refresh`,
          );
          return this.dispatchWithTelemetry(
            () =>
              this.callProviderStreaming(
                provider,
                params,
                refreshedKey,
                onToken,
              ),
            params,
            organizationId,
            provider,
            true,
            callContext,
          );
        }
      }
      throw error;
    }
  }

  private async dispatchWithTelemetry(
    run: () => Promise<OpenRouterChatCompletionResponse>,
    params: OpenRouterChatCompletionParams,
    organizationId: string | undefined,
    provider: LlmProvider,
    isByok: boolean,
    callContext?: ILlmCompletionCallContext,
  ): Promise<OpenRouterChatCompletionResponse> {
    const startedAt = Date.now();
    const response = await run();
    const carriesExactCost =
      params.model === AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO ||
      params.model === AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE ||
      typeof response.usage.cost === 'number';
    const billedResponse: OpenRouterChatCompletionResponse = carriesExactCost
      ? { ...response, usage: { ...response.usage, is_byok: isByok } }
      : response;
    try {
      await this.llmCompletionTelemetryService.recordCompletion({
        brandId: callContext?.brandId,
        completionTokens: billedResponse.usage?.completion_tokens ?? 0,
        isByok,
        latencyMs: Date.now() - startedAt,
        model: billedResponse.model ?? params.model,
        organizationId,
        promptTokens: billedResponse.usage?.prompt_tokens ?? 0,
        provider,
        runId: callContext?.runId,
        threadId: callContext?.threadId,
        userId: callContext?.userId,
        ...(typeof billedResponse.usage.cost === 'number'
          ? {
              vendorCostMicros: isByok
                ? 0
                : Math.round(billedResponse.usage.cost * 1_000_000),
            }
          : {}),
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}: completion telemetry failed`,
        error,
      );
    }
    return billedResponse;
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
        try {
          return await this.openRouterService.chatCompletion(
            params,
            apiKeyOverride,
          );
        } catch (error: unknown) {
          if (!this.shouldFallbackFreeRouter(params.model, error)) {
            throw error;
          }
          this.loggerService.warn(
            `${this.constructorName}: Free router unavailable — falling back to ${AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH}`,
          );
          return this.openRouterService.chatCompletion(
            {
              ...params,
              model: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
            },
            apiKeyOverride,
          );
        }
    }
  }

  private async callProviderStreaming(
    provider: LlmProvider,
    params: OpenRouterChatCompletionParams,
    apiKeyOverride?: string,
    onToken?: OpenRouterStreamTokenHandler,
  ): Promise<OpenRouterChatCompletionResponse> {
    switch (provider) {
      case 'anthropic':
        return this.anthropicService.streamChatCompletionAggregated(
          params,
          apiKeyOverride,
          onToken,
        );
      case 'openai':
        return this.openAiLlmService.streamChatCompletionAggregated(
          params,
          apiKeyOverride,
          onToken,
        );
      default:
        try {
          return await this.openRouterService.streamChatCompletionAggregated(
            params,
            apiKeyOverride,
            onToken,
          );
        } catch (error: unknown) {
          if (!this.shouldFallbackFreeRouter(params.model, error)) {
            throw error;
          }
          this.loggerService.warn(
            `${this.constructorName}: Free router stream unavailable — falling back to ${AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH}`,
          );
          return this.openRouterService.streamChatCompletionAggregated(
            {
              ...params,
              model: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
            },
            apiKeyOverride,
            onToken,
          );
        }
    }
  }

  private shouldFallbackFreeRouter(model: string, error: unknown): boolean {
    if (model !== AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE) {
      return false;
    }
    const value = error as { status?: number; response?: { status?: number } };
    const status = value.status ?? value.response?.status;
    return status === 400 || status === 404 || status === 422 || status === 429;
  }

  /**
   * Streaming variant of {@link callLocalProvider}: warms the vLLM instance and
   * streams from it, falling back to the cheapest OpenRouter model when GPU_LLM_URL is
   * unset.
   */
  private async callLocalProviderStreaming(
    params: OpenRouterChatCompletionParams,
    onToken?: OpenRouterStreamTokenHandler,
  ): Promise<OpenRouterChatCompletionResponse> {
    const llmUrl = String(this.configService.get('GPU_LLM_URL') || '');

    if (!llmUrl) {
      this.loggerService.warn(
        `${this.constructorName}: GPU_LLM_URL not configured — streaming falls back to ${SELF_HOSTED_FALLBACK_MODEL}`,
      );
      return this.openRouterService.streamChatCompletionAggregated(
        { ...params, model: SELF_HOSTED_FALLBACK_MODEL },
        undefined,
        onToken,
      );
    }

    this.loggerService.log(
      `${this.constructorName}: Streaming ${params.model} → local vLLM at ${llmUrl}`,
    );

    await this.llmInstanceService.ensureRunning();

    return this.openAiLlmService.streamChatCompletionAggregated(
      params,
      undefined,
      onToken,
      `${llmUrl}/v1`,
    );
  }

  /**
   * Route to local vLLM instance (OpenAI-compatible API).
   * Starts the EC2 instance if stopped, waits for health, then calls vLLM.
   * Falls back to the cheapest catalogued model if GPU_LLM_URL is not configured.
   */
  private async callLocalProvider(
    params: OpenRouterChatCompletionParams,
  ): Promise<OpenRouterChatCompletionResponse> {
    const llmUrl = String(this.configService.get('GPU_LLM_URL') || '');

    if (!llmUrl) {
      this.loggerService.warn(
        `${this.constructorName}: GPU_LLM_URL not configured — falling back to ${SELF_HOSTED_FALLBACK_MODEL}`,
      );
      return this.openRouterService.chatCompletion({
        ...params,
        model: SELF_HOSTED_FALLBACK_MODEL,
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
