import {
  OPENROUTER_FIRST_PARTY_PROVIDER_POLICY,
  type OpenRouterChatCompletionParams,
  type OpenRouterChatCompletionResponse,
  type OpenRouterStreamChunk,
  type OpenRouterStreamTokenHandler,
  type OpenRouterToolCallResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface OpenRouterErrorDetails {
  message: string;
  providerMessage?: string;
  status?: number;
  statusText?: string;
  transportStatus?: number;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null
    ? (value as UnknownRecord)
    : undefined;
}

function asHttpStatus(value: unknown): number | undefined {
  const status = typeof value === 'string' ? Number(value) : value;
  return typeof status === 'number' && Number.isInteger(status)
    ? status
    : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function parseRawProviderError(value: unknown): UnknownRecord | undefined {
  if (typeof value !== 'string') {
    return asRecord(value);
  }

  try {
    return asRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

@Injectable()
export class OpenRouterService {
  private readonly apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
  private readonly generationUrl = 'https://openrouter.ai/api/v1/generation';
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {}

  private resolveApiKey(apiKeyOverride?: string): string {
    const apiKey =
      apiKeyOverride || this.configService.get('OPENROUTER_API_KEY');

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    return apiKey;
  }

  /**
   * First-party and BYOK requests both send OpenRouter's documented
   * `provider.zdr` + `provider.data_collection` flags. ADR #3012 / #3029.
   */
  private withRetentionPolicy(
    params: OpenRouterChatCompletionParams,
  ): OpenRouterChatCompletionParams {
    return {
      ...params,
      provider: {
        ...params.provider,
        ...OPENROUTER_FIRST_PARTY_PROVIDER_POLICY,
        ...(params.tools?.length ? { require_parameters: true } : {}),
      },
    };
  }

  private getSafeErrorDetails(error: unknown): OpenRouterErrorDetails {
    const errorRecord = asRecord(error);
    const response = asRecord(errorRecord?.response);
    const responseData = response?.data;
    const envelope = asRecord(responseData);
    const envelopeError = asRecord(envelope?.error);
    const metadata = asRecord(envelopeError?.metadata);
    const rawEnvelope = parseRawProviderError(metadata?.raw);
    const rawError = asRecord(rawEnvelope?.error) ?? rawEnvelope;
    const transportStatus =
      asHttpStatus(response?.status) ?? asHttpStatus(errorRecord?.status);
    const status =
      asHttpStatus(rawError?.code) ??
      asHttpStatus(envelopeError?.code) ??
      transportStatus;
    const providerMessage =
      asNonEmptyString(rawError?.message) ??
      asNonEmptyString(envelopeError?.message) ??
      (typeof responseData === 'string' ? responseData : undefined) ??
      asNonEmptyString(envelope?.message);

    return {
      message:
        providerMessage ??
        asNonEmptyString(errorRecord?.message) ??
        'Unknown OpenRouter error',
      providerMessage,
      status,
      statusText: asNonEmptyString(response?.statusText),
      transportStatus,
    };
  }

  async chatCompletion(
    params: OpenRouterChatCompletionParams,
    apiKeyOverride?: string,
  ): Promise<OpenRouterChatCompletionResponse> {
    const apiKey = this.resolveApiKey(apiKeyOverride);

    try {
      const response = await firstValueFrom(
        this.httpService.post<OpenRouterChatCompletionResponse>(
          this.apiUrl,
          { ...this.withRetentionPolicy(params), stream: false },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://genfeed.ai',
              'X-Title': 'Genfeed AI',
            },
          },
        ),
      );

      return await this.attachExactUsageCost(response.data, apiKey);
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}.chatCompletion failed`,
        this.getSafeErrorDetails(error),
      );
      throw error;
    }
  }

  async streamChatCompletion(
    params: OpenRouterChatCompletionParams,
    apiKeyOverride?: string,
  ): Promise<ReadableStream<string>> {
    const apiKey = this.resolveApiKey(apiKeyOverride);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.apiUrl,
          { ...this.withRetentionPolicy(params), stream: true },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://genfeed.ai',
              'X-Title': 'Genfeed AI',
            },
            responseType: 'stream',
          },
        ),
      );

      const stream = response.data as AsyncIterable<Uint8Array | string>;

      return new ReadableStream<string>({
        async start(controller) {
          const decoder = new TextDecoder();
          let buffer = '';

          try {
            for await (const chunk of stream) {
              buffer +=
                typeof chunk === 'string'
                  ? chunk
                  : decoder.decode(chunk, { stream: true });

              let boundaryIndex = buffer.indexOf('\n\n');
              while (boundaryIndex >= 0) {
                const rawEvent = buffer.slice(0, boundaryIndex);
                buffer = buffer.slice(boundaryIndex + 2);
                boundaryIndex = buffer.indexOf('\n\n');

                const lines = rawEvent
                  .split('\n')
                  .map((line) => line.trim())
                  .filter((line) => line.startsWith('data:'));

                for (const line of lines) {
                  const payload = line.slice(5).trim();

                  if (!payload || payload === '[DONE]') {
                    continue;
                  }

                  const parsed = JSON.parse(payload) as OpenRouterStreamChunk;
                  const token = parsed.choices[0]?.delta?.content;

                  if (token) {
                    controller.enqueue(token);
                  }
                }
              }
            }

            const flushed = decoder.decode();
            if (flushed) {
              buffer += flushed;
            }

            if (buffer.trim().length > 0) {
              const trailingLines = buffer
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.startsWith('data:'));

              for (const line of trailingLines) {
                const payload = line.slice(5).trim();

                if (!payload || payload === '[DONE]') {
                  continue;
                }

                const parsed = JSON.parse(payload) as OpenRouterStreamChunk;
                const token = parsed.choices[0]?.delta?.content;

                if (token) {
                  controller.enqueue(token);
                }
              }
            }

            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}.streamChatCompletion failed`,
        this.getSafeErrorDetails(error),
      );
      throw error;
    }
  }

  /**
   * Real incremental streaming that also returns the fully aggregated response
   * (text + tool calls + usage). Text deltas surface through `onToken`;
   * tool-call fragments and usage are accumulated across SSE chunks so the
   * resolved value matches `chatCompletion`.
   */
  async streamChatCompletionAggregated(
    params: OpenRouterChatCompletionParams,
    apiKeyOverride?: string,
    onToken?: OpenRouterStreamTokenHandler,
  ): Promise<OpenRouterChatCompletionResponse> {
    const apiKey = this.resolveApiKey(apiKeyOverride);

    try {
      return await this.streamChatCompletionAggregatedOnce(
        params,
        apiKey,
        onToken,
      );
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}.streamChatCompletionAggregated failed`,
        this.getSafeErrorDetails(error),
      );
      throw error;
    }
  }

  private async streamChatCompletionAggregatedOnce(
    params: OpenRouterChatCompletionParams,
    apiKey: string,
    onToken?: OpenRouterStreamTokenHandler,
  ): Promise<OpenRouterChatCompletionResponse> {
    let content = '';
    let reasoningContent: string | null = null;
    let finishReason = 'stop';
    let streamId = '';
    let actualModel = params.model;
    let usage: OpenRouterChatCompletionResponse['usage'] = {
      completion_tokens: 0,
      prompt_tokens: 0,
      total_tokens: 0,
    };
    // Tool-call fragments arrive split across chunks, keyed by index.
    const toolCallsByIndex = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    const applyChunk = (parsed: OpenRouterStreamChunk): void => {
      if (parsed.id) {
        streamId = parsed.id;
      }
      if (parsed.model) {
        actualModel = parsed.model;
      }
      if (parsed.usage) {
        usage = {
          completion_tokens: parsed.usage.completion_tokens ?? 0,
          prompt_tokens: parsed.usage.prompt_tokens ?? 0,
          total_tokens: parsed.usage.total_tokens ?? 0,
          ...(typeof parsed.usage.cost === 'number'
            ? { cost: parsed.usage.cost, cost_source: 'usage' as const }
            : {}),
        };
      }

      const choice = parsed.choices[0];
      if (!choice) {
        return;
      }
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
      if (choice.delta?.reasoning_content) {
        reasoningContent =
          (reasoningContent ?? '') + choice.delta.reasoning_content;
      }
      if (choice.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const existing = toolCallsByIndex.get(tc.index) ?? {
            arguments: '',
            id: '',
            name: '',
          };
          if (tc.id) {
            existing.id = tc.id;
          }
          if (tc.function?.name) {
            existing.name = tc.function.name;
          }
          if (tc.function?.arguments) {
            existing.arguments += tc.function.arguments;
          }
          toolCallsByIndex.set(tc.index, existing);
        }
      }
    };

    const response = await firstValueFrom(
      this.httpService.post(
        this.apiUrl,
        {
          ...this.withRetentionPolicy(params),
          stream: true,
          usage: { include: true },
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://genfeed.ai',
            'X-Title': 'Genfeed AI',
          },
          responseType: 'stream',
        },
      ),
    );

    const stream = response.data as AsyncIterable<Uint8Array | string>;
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of stream) {
      buffer +=
        typeof chunk === 'string'
          ? chunk
          : decoder.decode(chunk, { stream: true });

      let boundaryIndex = buffer.indexOf('\n\n');
      while (boundaryIndex >= 0) {
        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        boundaryIndex = buffer.indexOf('\n\n');
        content += await this.drainStreamEvent(rawEvent, applyChunk, onToken);
      }
    }

    const flushed = decoder.decode();
    if (flushed) {
      buffer += flushed;
    }
    if (buffer.trim().length > 0) {
      content += await this.drainStreamEvent(buffer, applyChunk, onToken);
    }

    const toolCalls: OpenRouterToolCallResponse[] = Array.from(
      toolCallsByIndex.entries(),
    )
      .sort(([a], [b]) => a - b)
      .map(([, tc]) => ({
        function: { arguments: tc.arguments, name: tc.name },
        id: tc.id,
        type: 'function' as const,
      }));

    return await this.attachExactUsageCost(
      {
        choices: [
          {
            finish_reason: finishReason,
            message: {
              content: content || null,
              reasoning_content: reasoningContent,
              role: 'assistant',
              tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            },
          },
        ],
        id: streamId,
        model: actualModel,
        usage,
      },
      apiKey,
    );
  }

  private async drainStreamEvent(
    rawEvent: string,
    applyChunk: (chunk: OpenRouterStreamChunk) => void,
    onToken?: OpenRouterStreamTokenHandler,
  ): Promise<string> {
    const lines = rawEvent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'));
    let content = '';

    for (const line of lines) {
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') {
        continue;
      }

      const parsed: unknown = JSON.parse(payload);
      const envelope = asRecord(parsed);
      const streamError = asRecord(envelope?.error);
      if (streamError) {
        const status = asHttpStatus(streamError.code) ?? 502;
        throw Object.assign(
          new Error(
            asNonEmptyString(streamError.message) ?? 'OpenRouter stream failed',
          ),
          {
            response: { data: envelope, status },
            status,
          },
        );
      }

      const chunk = parsed as OpenRouterStreamChunk;
      applyChunk(chunk);

      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        content += token;
        if (onToken) {
          await onToken(token);
        }
      }
    }

    return content;
  }

  private async attachExactUsageCost(
    response: OpenRouterChatCompletionResponse,
    apiKey: string,
  ): Promise<OpenRouterChatCompletionResponse> {
    if (typeof response.usage?.cost === 'number') {
      return {
        ...response,
        usage: { ...response.usage, cost_source: 'usage' },
      };
    }
    if (!response.id) {
      return response;
    }

    try {
      const metadata = await firstValueFrom(
        this.httpService.get<{
          data?: { is_byok?: boolean; model?: string; total_cost?: number };
        }>(this.generationUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
          params: { id: response.id },
        }),
      );
      const data = metadata.data.data;
      if (typeof data?.total_cost !== 'number') {
        return response;
      }
      return {
        ...response,
        model: data.model ?? response.model,
        usage: {
          ...response.usage,
          cost: data.total_cost,
          cost_source: 'generation',
          is_byok: data.is_byok,
        },
      };
    } catch (error: unknown) {
      this.loggerService.warn(
        `${this.constructorName}.generationMetadata unavailable`,
        { generationId: response.id, ...this.getSafeErrorDetails(error) },
      );
      return response;
    }
  }
}
