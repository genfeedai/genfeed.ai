import { ConfigService } from '@api/config/config.service';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
  OpenRouterStreamChunk,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
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
}
