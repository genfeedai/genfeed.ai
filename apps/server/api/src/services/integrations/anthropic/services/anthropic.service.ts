import Anthropic from '@anthropic-ai/sdk';
import type {
  Message,
  MessageParam,
  Tool,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { ConfigService } from '@api/config/config.service';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
  OpenRouterMessage,
  OpenRouterTool,
  OpenRouterToolCallResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AnthropicService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  private resolveApiKey(apiKeyOverride?: string): string {
    const apiKey =
      apiKeyOverride || this.configService.get('ANTHROPIC_API_KEY');

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    return String(apiKey);
  }

  private createClient(apiKey: string): Anthropic {
    return new Anthropic({ apiKey });
  }

  /**
   * Extract system prompt from messages and return remaining messages.
   * Anthropic requires system prompt as a separate parameter.
   */
  private extractSystemPrompt(messages: OpenRouterMessage[]): {
    system: string | undefined;
    messages: MessageParam[];
  } {
    let system: string | undefined;
    const converted: MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system =
          (typeof msg.content === 'string' ? msg.content : undefined) ||
          undefined;
        continue;
      }

      if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const content: Anthropic.ContentBlockParam[] = [];

          if (msg.content && typeof msg.content === 'string') {
            content.push({ text: msg.content, type: 'text' });
          }

          for (const tc of msg.tool_calls) {
            let input: Record<string, unknown> = {};
            try {
              input = JSON.parse(tc.function.arguments);
            } catch {
              // Keep empty object if parsing fails
            }

            content.push({
              id: tc.id,
              input,
              name: tc.function.name,
              type: 'tool_use',
            });
          }

          converted.push({ content, role: 'assistant' });
        } else {
          converted.push({
            content: typeof msg.content === 'string' ? msg.content || '' : '',
            role: 'assistant',
          });
        }
        continue;
      }

      if (msg.role === 'tool') {
        // Anthropic uses tool_result blocks within user messages
        const toolResult: ToolResultBlockParam = {
          content: typeof msg.content === 'string' ? msg.content || '' : '',
          tool_use_id: msg.tool_call_id || '',
          type: 'tool_result',
        };

        // Check if the last converted message is a user message with tool results
        const lastMsg = converted[converted.length - 1];
        if (lastMsg?.role === 'user' && Array.isArray(lastMsg.content)) {
          (lastMsg.content as ToolResultBlockParam[]).push(toolResult);
        } else {
          converted.push({
            content: [toolResult],
            role: 'user',
          });
        }
        continue;
      }

      // Regular user message — may contain multimodal content parts
      if (Array.isArray(msg.content)) {
        const blocks: Anthropic.ContentBlockParam[] = [];
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            blocks.push({ text: part.text, type: 'text' });
          } else if (part.type === 'image_url' && part.image_url?.url) {
            blocks.push({
              source: {
                type: 'url',
                url: part.image_url.url,
              },
              type: 'image',
            } as Anthropic.ContentBlockParam);
          }
        }
        converted.push({
          content: blocks.length > 0 ? blocks : '',
          role: 'user',
        });
      } else {
        converted.push({
          content: msg.content || '',
          role: 'user',
        });
      }
    }

    return { messages: converted, system };
  }

  /**
   * Convert OpenRouter tool format to Anthropic tool format.
   */
  private convertTools(tools: OpenRouterTool[]): Tool[] {
    return tools.map((tool) => ({
      description: tool.function.description,
      input_schema: tool.function.parameters as Tool['input_schema'],
      name: tool.function.name,
    }));
  }

  /**
   * Convert Anthropic response to OpenRouter-compatible format.
   */
  private convertResponse(
    response: Message,
    model: string,
  ): OpenRouterChatCompletionResponse {
    let textContent: string | null = null;
    const toolCalls: OpenRouterToolCallResponse[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent = (block as { type: 'text'; text: string }).text;
      } else if (block.type === 'tool_use') {
        const toolBlock = block as {
          type: 'tool_use';
          id: string;
          name: string;
          input: unknown;
        };
        toolCalls.push({
          function: {
            arguments: JSON.stringify(toolBlock.input),
            name: toolBlock.name,
          },
          id: toolBlock.id,
          type: 'function',
        });
      }
    }

    return {
      choices: [
        {
          finish_reason:
            response.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
          message: {
            content: textContent,
            role: 'assistant',
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          },
        },
      ],
      id: response.id,
      model,
      usage: {
        completion_tokens: response.usage.output_tokens,
        prompt_tokens: response.usage.input_tokens,
        total_tokens:
          response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  /**
   * Resolve the correct max_tokens for a model.
   * Anthropic requires max_tokens and different models have different limits.
   */
  private resolveMaxTokens(model: string, requestedMax?: number): number {
    const defaultMax = 4096;

    if (requestedMax && requestedMax > 0) {
      return requestedMax;
    }

    // Opus and Sonnet 4.x models support up to 16384 output tokens
    if (model.includes('opus') || model.includes('sonnet-4')) {
      return defaultMax;
    }

    return defaultMax;
  }

  async chatCompletion(
    params: OpenRouterChatCompletionParams,
    apiKeyOverride?: string,
  ): Promise<OpenRouterChatCompletionResponse> {
    const apiKey = this.resolveApiKey(apiKeyOverride);
    const client = this.createClient(apiKey);

    try {
      // Strip provider prefix (anthropic/) from model name
      const model = params.model.replace(/^anthropic\//, '');

      const { messages, system } = this.extractSystemPrompt(params.messages);
      const maxTokens = this.resolveMaxTokens(model, params.max_tokens);

      const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
        max_tokens: maxTokens,
        messages,
        model,
        temperature: params.temperature,
      };

      if (system) {
        requestParams.system = system;
      }

      if (params.tools && params.tools.length > 0) {
        requestParams.tools = this.convertTools(params.tools);

        if (params.tool_choice === 'auto') {
          requestParams.tool_choice = { type: 'auto' };
        } else if (params.tool_choice === 'none') {
          // Anthropic doesn't have 'none' — omit tools entirely
          delete requestParams.tools;
        } else if (
          typeof params.tool_choice === 'object' &&
          params.tool_choice.type === 'function'
        ) {
          requestParams.tool_choice = {
            name: params.tool_choice.function.name,
            type: 'tool',
          };
        }
      }

      const response = await client.messages.create(requestParams);

      return this.convertResponse(response as Message, model);
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
    const client = this.createClient(apiKey);

    try {
      const model = params.model.replace(/^anthropic\//, '');
      const { messages, system } = this.extractSystemPrompt(params.messages);
      const maxTokens = this.resolveMaxTokens(model, params.max_tokens);

      const streamParams: Anthropic.MessageCreateParamsNonStreaming = {
        max_tokens: maxTokens,
        messages,
        model,
        temperature: params.temperature,
      };

      if (system) {
        streamParams.system = system;
      }

      if (params.tools && params.tools.length > 0) {
        streamParams.tools = this.convertTools(params.tools);
      }

      const stream = client.messages.stream(streamParams);

      return new ReadableStream<string>({
        async start(controller) {
          try {
            for await (const event of stream) {
              if (
                event.type === 'content_block_delta' &&
                'delta' in event &&
                (event.delta as { type: string; text?: string }).type ===
                  'text_delta'
              ) {
                controller.enqueue(
                  (event.delta as { type: string; text: string }).text,
                );
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

  private getSafeErrorDetails(error: unknown): Record<string, unknown> {
    const errorRecord = error as {
      message?: string;
      status?: number;
      error?: { message?: string; type?: string };
    };

    return {
      message: errorRecord?.message ?? 'Unknown Anthropic error',
      providerMessage: errorRecord?.error?.message,
      status: errorRecord?.status,
      type: errorRecord?.error?.type,
    };
  }
}
