import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { GrokTrendData } from '@api/services/integrations/xai/dto/grok-trends.dto';
import {
  GROK_TREND_EXTRACTION_SCHEMA_NAME,
  grokTrendExtractionSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

interface ChatCompletionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  max_tokens?: number;
}

type ChatCompletionResponse = OpenRouterChatCompletionResponse;

@Injectable()
export class XaiService {
  private readonly defaultModel: string;
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly openRouterService: OpenRouterService,
    private readonly llmDispatcherService: LlmDispatcherService,
  ) {
    this.defaultModel =
      this.configService.get('XAI_MODEL') || LLM_DEFAULTS.grok;
  }

  /**
   * Get trends from Grok
   */
  async getTrends(options?: {
    limit?: number;
    region?: string;
  }): Promise<GrokTrendData[]> {
    const limit = options?.limit || 10;
    const region = options?.region || 'US';
    const prompt = this.buildTrendsPrompt(limit, region);

    try {
      const extraction = await this.llmDispatcherService.completeStructured({
        max_tokens: 2000,
        messages: [{ content: prompt, role: 'user' }],
        model: this.qualifyModel(this.defaultModel),
        schema: grokTrendExtractionSchema,
        schemaName: GROK_TREND_EXTRACTION_SCHEMA_NAME,
        temperature: 0.7,
      });

      return extraction.trends;
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}.getTrends failed`,
        error,
      );
      throw error;
    }
  }

  /**
   * General chat completion method — delegates to OpenRouter
   */
  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const model = this.qualifyModel(request.model);

    try {
      return await this.openRouterService.chatCompletion({
        max_tokens: request.max_tokens,
        messages: request.messages,
        model,
        temperature: request.temperature,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${this.constructorName}.chat failed`, error);
      throw error;
    }
  }

  /** Grok model ids are routed by their `x-ai/` prefix. */
  private qualifyModel(model: string): string {
    return model.startsWith('x-ai/') ? model : `x-ai/${model}`;
  }

  /**
   * Build prompt for fetching trends
   */
  private buildTrendsPrompt(limit: number, region: string): string {
    const currentDate = new Date().toISOString().slice(0, 10);

    return `You have real-time access to X (Twitter).
Today is ${currentDate}.
Region: ${region}.
List the top ${limit} trending topics right now in ${region}.

Exclude completed historical events unless they are newly re-trending today because of a current trigger.
Do not include stale year-tagged topics from prior years.

For each trend give the topic or hashtag, an estimated mention count, a
growth rate between 0 and 100, one sentence on why it is trending today,
related hashtags, and a content idea for creators.`;
  }
}
