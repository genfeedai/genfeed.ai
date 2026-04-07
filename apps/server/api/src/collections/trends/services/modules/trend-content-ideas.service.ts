import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { TrendIdea } from '@api/collections/trends/dto/trend-ideas.dto';
import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TrendContentIdeasService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
  ) {}

  /**
   * Generate AI-powered content ideas for trends
   */
  async generateContentIdeas(
    trends: TrendEntity[],
    limit: number = 10,
    onBilling?: (amount: number) => void,
  ): Promise<Map<string, TrendIdea[]>> {
    const ideasMap = new Map<string, TrendIdea[]>();

    try {
      // Group trends by platform
      const trendsByPlatform = trends.reduce(
        (acc, trend) => {
          if (!acc[trend.platform]) {
            acc[trend.platform] = [];
          }
          acc[trend.platform].push(trend);
          return acc;
        },
        {} as Record<string, TrendEntity[]>,
      );

      // Generate ideas for each platform
      for (const [platform, platformTrends] of Object.entries(
        trendsByPlatform,
      )) {
        const topTrends = platformTrends
          .sort((a, b) => b.viralityScore - a.viralityScore)
          .slice(0, 5);

        const ideas = await this.generateIdeasForPlatform(
          platform,
          topTrends,
          Math.ceil(limit / Object.keys(trendsByPlatform).length),
          onBilling,
        );

        ideasMap.set(platform, ideas);
      }
    } catch (error: unknown) {
      this.loggerService.error('Failed to generate content ideas', error);
    }

    return ideasMap;
  }

  /**
   * Sanitize input for AI prompts to prevent injection attacks
   */
  sanitizeForPrompt(input: string | number): string {
    const str = String(input);

    // Remove potential prompt injection patterns
    return str
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .substring(0, 2000); // Limit length to prevent token overflow
  }

  /**
   * Call API with exponential backoff retry logic
   */
  async callWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 2000,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error;

        // Calculate exponential backoff delay
        const delay = baseDelay * 2 ** attempt;
        const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
        const totalDelay = delay + jitter;

        this.loggerService.warn(
          `API call failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${Math.round(totalDelay)}ms`,
          {
            attempt: attempt + 1,
            error: (error as Error)?.message,
            maxRetries,
            service: 'TrendContentIdeasService',
          },
        );

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, totalDelay));
      }
    }

    // All retries exhausted
    this.loggerService.error('API call failed after all retries', lastError, {
      finalError: (lastError as Error)?.message,
      maxRetries,
      service: 'TrendContentIdeasService',
    });
    throw lastError;
  }

  /**
   * Parse and validate JSON response from AI
   */
  parseAIResponse(content: string, platform: string): TrendIdea[] {
    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      this.loggerService.error(
        'No JSON array found in AI response',
        new Error('Invalid response format'),
        {
          contentPreview: content.substring(0, 200),
          platform,
          service: 'TrendContentIdeasService',
        },
      );
      throw new Error('No JSON array found in response');
    }

    let ideas: TrendIdea[];
    try {
      ideas = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!Array.isArray(ideas)) {
        throw new Error('Response is not an array');
      }

      if (ideas.length === 0) {
        this.loggerService.warn('AI returned empty ideas array', {
          platform,
          service: 'TrendContentIdeasService',
        });
      }

      // Validate each idea has required fields
      ideas.forEach((idea, index) => {
        if (!idea.title || !idea.description || !idea.contentType) {
          throw new Error(
            `Idea at index ${index} missing required fields: ${JSON.stringify(idea)}`,
          );
        }
      });

      return ideas;
    } catch (error: unknown) {
      this.loggerService.error(
        'Failed to parse or validate AI response',
        error,
      );
      return []; // Graceful degradation
    }
  }

  /**
   * Generate ideas for a specific platform
   */
  async generateIdeasForPlatform(
    platform: string,
    trends: TrendEntity[],
    count: number,
    onBilling?: (amount: number) => void,
  ): Promise<TrendIdea[]> {
    try {
      const trendTopics = trends.map((t) => t.topic).join(', ');
      const avgVirality = Math.round(
        trends.reduce((sum, t) => sum + t.viralityScore, 0) / trends.length,
      );

      // Sanitize inputs to prevent prompt injection
      const sanitizedTopics = this.sanitizeForPrompt(trendTopics);
      const sanitizedPlatform = this.sanitizeForPrompt(platform);
      const sanitizedCount = Math.min(Math.max(count, 1), 20); // Clamp to 1-20

      const prompt = `Generate ${sanitizedCount} creative content ideas for ${sanitizedPlatform} based on these trending topics: ${sanitizedTopics}. Average virality score: ${avgVirality}/100.

For each idea, provide:
1. A catchy title
2. A brief description (1-2 sentences)
3. Content type (video, image, carousel, thread, or text)
4. Suggested hashtags (3-5)
5. A sample caption (1-2 sentences)
6. Estimated views range

Format as JSON array with this structure:
[
  {
    "title": "string",
    "description": "string",
    "contentType": "video|image|carousel|thread|text",
    "hashtags": ["string"],
    "caption": "string",
    "estimatedViews": "string (e.g., '10K-50K')"
  }
]

Make ideas creative, engaging, and platform-appropriate.

Return ONLY valid JSON. Do not include any text before or after the JSON array.`;

      // Call Replicate GPT-5.2 with retry logic
      const input = {
        max_completion_tokens: 2000,
        prompt,
      };
      const content = await this.callWithRetry(
        () =>
          this.replicateService.generateTextCompletionSync(
            DEFAULT_TEXT_MODEL,
            input,
          ),
        3, // max retries
        2000, // base delay 2s
      );

      if (!content) {
        this.loggerService.error(
          'AI returned empty content',
          new Error('No content generated'),
          {
            platform,
            sanitizedCount,
            service: 'TrendContentIdeasService',
          },
        );
        return [];
      }

      onBilling?.(await this.calculateDefaultTextCharge(input, content));

      // Parse and validate JSON response with robust error handling
      const ideas = this.parseAIResponse(content, platform);

      return ideas.slice(0, sanitizedCount);
    } catch (error: unknown) {
      this.loggerService.error(
        `Failed to generate ideas for ${platform}`,
        error,
        {
          count,
          errorMessage: (error as Error)?.message,
          errorStatus: (error as Record<string, unknown>)?.status,
          platform,
          service: 'TrendContentIdeasService',
        },
      );
      return []; // Graceful degradation
    }
  }

  private async calculateDefaultTextCharge(
    input: Record<string, unknown>,
    output: string,
  ): Promise<number> {
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      throw new Error(
        `Model pricing is not configured for ${DEFAULT_TEXT_MODEL}`,
      );
    }

    return calculateEstimatedTextCredits(model, input, output);
  }
}
