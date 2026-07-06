import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
  OpenRouterStreamChunk,
  OpenRouterStreamTokenHandler,
  OpenRouterToolCallResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OpenRouterService {
  private readonly apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
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

  private getSafeErrorDetails(error: unknown): Record<string, unknown> {
    const errorRecord = error as {
      message?: string;
      response?: {
        data?: unknown;
        status?: number;
        statusText?: string;
      };
    };

    const responseData = errorRecord?.response?.data;
    const providerMessage =
      typeof responseData === 'string'
        ? responseData
        : typeof responseData === 'object' && responseData
          ? (responseData as Record<string, unknown>).message
          : undefined;

    return {
      message: errorRecord?.message ?? 'Unknown OpenRouter error',
      providerMessage:
        typeof providerMessage === 'string' ? providerMessage : undefined,
      status: errorRecord?.response?.status,
      statusText: errorRecord?.response?.statusText,
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
          { ...params, stream: false },
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

      return response.data;
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
          { ...params, stream: true },
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

    let content = '';
    let reasoningContent: string | null = null;
    let finishReason = 'stop';
    let streamId = '';
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
      if (parsed.usage) {
        usage = {
          completion_tokens: parsed.usage.completion_tokens ?? 0,
          prompt_tokens: parsed.usage.prompt_tokens ?? 0,
          total_tokens: parsed.usage.total_tokens ?? 0,
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

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.apiUrl,
          { ...params, stream: true, usage: { include: true } },
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

      const drainEvent = async (rawEvent: string): Promise<void> => {
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
          applyChunk(parsed);

          const token = parsed.choices[0]?.delta?.content;
          if (token) {
            content += token;
            if (onToken) {
              await onToken(token);
            }
          }
        }
      };

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
          await drainEvent(rawEvent);
        }
      }

      const flushed = decoder.decode();
      if (flushed) {
        buffer += flushed;
      }
      if (buffer.trim().length > 0) {
        await drainEvent(buffer);
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

      return {
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
        model: params.model,
        usage,
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}.streamChatCompletionAggregated failed`,
        this.getSafeErrorDetails(error),
      );
      throw error;
    }
  }
}
