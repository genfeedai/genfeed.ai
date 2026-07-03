import { ConfigService } from '@api/config/config.service';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
  OpenRouterStreamTokenHandler,
  OpenRouterToolCallResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

@Injectable()
export class OpenAiLlmService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  private resolveApiKey(apiKeyOverride?: string): string {
    const apiKey = apiKeyOverride || this.configService.get('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    return String(apiKey);
  }

  private createClient(apiKey: string, baseURL?: string): OpenAI {
    return new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  private toTextContent(
    content:
      | string
      | null
      | OpenRouterChatCompletionParams['messages'][number]['content'],
  ): string | null {
    if (typeof content === 'string' || content === null) {
      return content;
    }

    return content.map((part) => part.text ?? '').join('');
  }

  /**
   * Convert OpenRouter messages to OpenAI SDK format.
   * Nearly 1:1 since OpenRouter uses OpenAI-compatible format.
   */
  private convertMessages(
    messages: OpenRouterChatCompletionParams['messages'],
  ): ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      const content = this.toTextContent(msg.content);

      if (msg.role === 'system') {
        return { content: content || '', role: 'system' as const };
      }

      if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          return {
            content,
            role: 'assistant' as const,
            tool_calls: msg.tool_calls.map((tc) => ({
              function: {
                arguments: tc.function.arguments,
                name: tc.function.name,
              },
              id: tc.id,
              type: 'function' as const,
            })),
          };
        }

        return {
          content,
          role: 'assistant' as const,
        };
      }

      if (msg.role === 'tool') {
        return {
          content: content || '',
          role: 'tool' as const,
          tool_call_id: msg.tool_call_id || '',
        };
      }

      return { content: content || '', role: 'user' as const };
    });
  }

  /**
   * Convert OpenRouter tools to OpenAI SDK format.
   */
  private convertTools(
    tools: OpenRouterChatCompletionParams['tools'],
  ): ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map((tool) => ({
      function: {
        description: tool.function.description,
        name: tool.function.name,
        parameters: tool.function.parameters,
      },
      type: 'function' as const,
    }));
  }

  async chatCompletion(
    params: OpenRouterChatCompletionParams,
    apiKeyOverride?: string,
    baseURL?: string,
  ): Promise<OpenRouterChatCompletionResponse> {
    const apiKey = baseURL ? 'not-needed' : this.resolveApiKey(apiKeyOverride);
    const client = this.createClient(apiKey, baseURL);

    try {
      // Strip provider prefixes (openai/, local/) from model name
      const model = params.model.replace(/^(?:openai|local)\//, '');
      const messages = this.convertMessages(params.messages);
      const tools = this.convertTools(params.tools);

      // Reasoning models (o3, o4-mini) don't support temperature or max_tokens
      const isReasoningModel = model.startsWith('o3') || model.startsWith('o4');

      const requestParams: Record<string, unknown> = {
        messages,
        model,
        stream: false,
      };

      if (!isReasoningModel) {
        if (params.temperature !== undefined) {
          requestParams.temperature = params.temperature;
        }
        if (params.max_tokens !== undefined) {
          requestParams.max_tokens = params.max_tokens;
        }
      }

      if (tools) {
        requestParams.tools = tools;

        if (params.tool_choice === 'auto') {
          requestParams.tool_choice = 'auto';
        } else if (params.tool_choice === 'none') {
          requestParams.tool_choice = 'none';
        } else if (
          typeof params.tool_choice === 'object' &&
          params.tool_choice.type === 'function'
        ) {
          requestParams.tool_choice = {
            function: { name: params.tool_choice.function.name },
            type: 'function',
          };
        }
      }

      const response = await client.chat.completions.create(
        requestParams as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      );

      const choice = response.choices[0];

      const toolCalls: OpenRouterToolCallResponse[] | undefined =
        choice?.message?.tool_calls
          ?.filter(
            (
              tc,
            ): tc is {
              id: string;
              type: 'function';
              function: { name: string; arguments: string };
            } => tc.type === 'function' && 'function' in tc,
          )
          .map((tc) => ({
            function: {
              arguments: tc.function.arguments,
              name: tc.function.name,
            },
            id: tc.id,
            type: 'function' as const,
          }));

      // Extract reasoning_content from OpenAI reasoning models (o3, o4-mini)
      const rawMessage = choice?.message as unknown as
        | Record<string, unknown>
        | undefined;
      const reasoningContent =
        (rawMessage?.reasoning_content as string | null) ?? null;

      return {
        choices: [
          {
            finish_reason: choice?.finish_reason || 'stop',
            message: {
              content: choice?.message?.content ?? null,
              reasoning_content: reasoningContent,
              role: 'assistant',
              tool_calls:
                toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
            },
          },
        ],
        id: response.id,
        model: params.model,
        usage: {
          completion_tokens: response.usage?.completion_tokens ?? 0,
          prompt_tokens: response.usage?.prompt_tokens ?? 0,
          total_tokens: response.usage?.total_tokens ?? 0,
        },
      };
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
    baseURL?: string,
  ): Promise<ReadableStream<string>> {
    const apiKey = baseURL ? 'not-needed' : this.resolveApiKey(apiKeyOverride);
    const client = this.createClient(apiKey, baseURL);

    try {
      const model = params.model.replace(/^(?:openai|local)\//, '');
      const messages = this.convertMessages(params.messages);
      const tools = this.convertTools(params.tools);

      const isReasoningModel = model.startsWith('o3') || model.startsWith('o4');

      const requestParams: Record<string, unknown> = {
        messages,
        model,
        stream: true,
      };

      if (!isReasoningModel) {
        if (params.temperature !== undefined) {
          requestParams.temperature = params.temperature;
        }
        if (params.max_tokens !== undefined) {
          requestParams.max_tokens = params.max_tokens;
        }
      }

      if (tools) {
        requestParams.tools = tools;
      }

      const stream = await client.chat.completions.create(
        requestParams as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
      );

      return new ReadableStream<string>({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const delta = chunk.choices[0]?.delta;
              if (delta?.content) {
                controller.enqueue(delta.content);
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
   * (text + tool calls + usage). Serves OpenAI and OpenAI-compatible local vLLM
   * (via `baseURL`). Text deltas surface through `onToken`; tool-call fragments
   * and usage are accumulated so the resolved value matches `chatCompletion`.
   */
  async streamChatCompletionAggregated(
    params: OpenRouterChatCompletionParams,
    apiKeyOverride?: string,
    onToken?: OpenRouterStreamTokenHandler,
    baseURL?: string,
  ): Promise<OpenRouterChatCompletionResponse> {
    const apiKey = baseURL ? 'not-needed' : this.resolveApiKey(apiKeyOverride);
    const client = this.createClient(apiKey, baseURL);

    try {
      const model = params.model.replace(/^(?:openai|local)\//, '');
      const messages = this.convertMessages(params.messages);
      const tools = this.convertTools(params.tools);

      const isReasoningModel = model.startsWith('o3') || model.startsWith('o4');

      const requestParams: Record<string, unknown> = {
        messages,
        model,
        stream: true,
        stream_options: { include_usage: true },
      };

      if (!isReasoningModel) {
        if (params.temperature !== undefined) {
          requestParams.temperature = params.temperature;
        }
        if (params.max_tokens !== undefined) {
          requestParams.max_tokens = params.max_tokens;
        }
      }

      if (tools) {
        requestParams.tools = tools;
      }

      const stream = await client.chat.completions.create(
        requestParams as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
      );

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

      for await (const chunk of stream) {
        if (chunk.id) {
          streamId = chunk.id;
        }
        if (chunk.usage) {
          usage = {
            completion_tokens: chunk.usage.completion_tokens ?? 0,
            prompt_tokens: chunk.usage.prompt_tokens ?? 0,
            total_tokens: chunk.usage.total_tokens ?? 0,
          };
        }

        const choice = chunk.choices[0];
        if (!choice) {
          continue;
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const delta = choice.delta as
          | {
              content?: string | null;
              reasoning_content?: string | null;
              tool_calls?: Array<{
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            }
          | undefined;

        if (delta?.reasoning_content) {
          reasoningContent = (reasoningContent ?? '') + delta.reasoning_content;
        }

        if (delta?.content) {
          content += delta.content;
          if (onToken) {
            await onToken(delta.content);
          }
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
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

  private getSafeErrorDetails(error: unknown): Record<string, unknown> {
    const errorRecord = error as {
      message?: string;
      status?: number;
      error?: { message?: string; type?: string; code?: string };
    };

    return {
      code: errorRecord?.error?.code,
      message: errorRecord?.message ?? 'Unknown OpenAI error',
      providerMessage: errorRecord?.error?.message,
      status: errorRecord?.status,
      type: errorRecord?.error?.type,
    };
  }
}
