import {
  SERVER_TOKENS,
  type ServerCustomerInstanceResolver,
} from '@api/server.dependencies';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { assertHostNotPrivate } from '@api/shared/utils/ssrf.util';
import { ModelProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import {
  BadGatewayException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';

const DEDICATED_TEXT_TIMEOUT_MS = 120_000;

export interface DedicatedTextRoute {
  apiUrl: string;
  /** The model's own name on the instance. */
  upstreamModel: string;
}

/**
 * Text requests for a model attached to one organization and served by that
 * organization's own dedicated instance.
 *
 * A model is routed here only when the organization owns a text model row whose
 * provider is Genfeed AI. Once it is, the request either runs on that
 * organization's running `llm` instance or fails: there is no fall-back to a
 * hosted model, no other organization's instance and no shared URL.
 *
 * What the round costs is never the instance's say. The instance's own price
 * and BYOK fields are dropped from its answer, and an answer that reports no
 * token usage is refused, so the round is priced from the model row's token
 * prices like any other model and can never settle at zero by omission.
 */
@Traced()
@Injectable()
export class DedicatedTextRouteService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly registry: AgentChatModelRegistryService,
    @Inject(SERVER_TOKENS.customerInstances)
    private readonly instances: ServerCustomerInstanceResolver,
  ) {}

  /** True when `modelKey` is a dedicated-instance model of this organization. */
  async isDedicatedModel(
    organizationId: string | undefined,
    modelKey: string,
  ): Promise<boolean> {
    return Boolean(await this.findModel(organizationId, modelKey));
  }

  /**
   * The route for a dedicated-instance model, or null when `modelKey` is not
   * one (the request then goes through the normal providers). Throws when it is
   * one and its instance is not running.
   */
  async resolve(
    organizationId: string | undefined,
    modelKey: string,
  ): Promise<DedicatedTextRoute | null> {
    const row = await this.findModel(organizationId, modelKey);
    if (!organizationId || !row) {
      return null;
    }

    const instance = await this.instances.findRunningForOrg(
      organizationId,
      'llm',
    );
    if (!instance?.apiUrl) {
      throw new ServiceUnavailableException(
        'The dedicated instance for this model is not running',
      );
    }

    return {
      apiUrl: instance.apiUrl,
      upstreamModel: row.externalId?.trim() || row.key,
    };
  }

  async chatCompletion(
    route: DedicatedTextRoute,
    params: OpenRouterChatCompletionParams,
  ): Promise<OpenRouterChatCompletionResponse> {
    assertHostNotPrivate(new URL(route.apiUrl).hostname);

    const response = await axios.post(
      `${route.apiUrl}/v1/chat/completions`,
      {
        max_tokens: params.max_tokens,
        messages: params.messages,
        model: route.upstreamModel,
        response_format: params.response_format,
        stream: false,
        temperature: params.temperature,
        tool_choice: params.tool_choice,
        tools: params.tools,
      },
      { maxRedirects: 0, timeout: DEDICATED_TEXT_TIMEOUT_MS },
    );

    return this.toBillableResponse(response.data, params.model);
  }

  private async findModel(organizationId: string | undefined, key: string) {
    if (!organizationId) {
      return undefined;
    }
    const row = await this.registry.findOrganizationModel(key, organizationId);
    return row?.provider === ModelProvider.GENFEED_AI ? row : undefined;
  }

  private toBillableResponse(
    data: Partial<OpenRouterChatCompletionResponse> | null | undefined,
    modelKey: string,
  ): OpenRouterChatCompletionResponse {
    const promptTokens = data?.usage?.prompt_tokens;
    const completionTokens = data?.usage?.completion_tokens;
    if (
      !Array.isArray(data?.choices) ||
      data.choices.length === 0 ||
      !Number.isFinite(promptTokens) ||
      !Number.isFinite(completionTokens) ||
      (promptTokens ?? -1) < 0 ||
      (completionTokens ?? -1) < 0
    ) {
      this.loggerService.error(
        'DedicatedTextRouteService: instance answer has no choices or token usage',
        { model: modelKey },
      );
      throw new BadGatewayException(
        'The dedicated instance returned an unusable answer',
      );
    }

    const prompt = promptTokens as number;
    const completion = completionTokens as number;
    return {
      choices: data.choices,
      id: data.id ?? `dedicated-${Date.now()}`,
      model: modelKey,
      usage: {
        completion_tokens: completion,
        prompt_tokens: prompt,
        total_tokens: prompt + completion,
      },
    };
  }
}
