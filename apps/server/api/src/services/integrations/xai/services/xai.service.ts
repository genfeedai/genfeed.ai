import { ConfigService } from '@api/config/config.service';
import type { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import type { GrokTrendData } from '@api/services/integrations/xai/dto/grok-trends.dto';
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
  ) {
    this.defaultModel =
      this.configService.get('XAI_MODEL') || 'x-ai/grok-4-fast';
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
      const response = await this.chat({
        max_tokens: 2000,
        messages: [{ content: prompt, role: 'user' }],
        model: this.defaultModel,
        temperature: 0.7,
      });

      return this.parseTrendsResponse(response);
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
    const model = request.model.startsWith('x-ai/')
      ? request.model
      : `x-ai/${request.model}`;

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

For each trend, provide as JSON array:
[{
  "topic": "topic or hashtag",
  "mentions": estimated_number,
  "growthRate": number_between_0_and_100,
  "context": "why it is trending today (1 sentence)",
  "hashtags": ["related", "hashtags"],
  "contentAngle": "content idea for creators"
}]

Return ONLY the JSON array, no other text.`;
  }

  /**
   * Parse Grok response into trend data
   */
  private parseTrendsResponse(
    response: ChatCompletionResponse,
  ): GrokTrendData[] {
    try {
      const content = response.choices[0]?.message?.content;

      if (!content) {
        this.loggerService.warn(
          `${this.constructorName}: Empty response from Grok`,
        );
        return [];
      }

      // Extract JSON from response (may have markdown code blocks)
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '');
      }

      const trends = JSON.parse(jsonStr) as GrokTrendData[];

      if (!Array.isArray(trends)) {
        throw new Error('Response is not an array');
      }

      // Validate and normalize trends
      return trends.map((trend) => ({
        contentAngle: trend.contentAngle || 'Create engaging content',
        context: trend.context || 'Trending topic',
        growthRate: Math.max(0, Math.min(100, trend.growthRate || 0)),
        hashtags: Array.isArray(trend.hashtags) ? trend.hashtags : [],
        mentions: Math.max(0, trend.mentions || 0),
        topic: trend.topic || 'Unknown',
      }));
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}: Failed to parse trends response`,
        error,
      );
      return [];
    }
  }
}
