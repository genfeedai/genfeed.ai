import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { TrendIdea } from '@api/collections/trends/dto/trend-ideas.dto';
import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import {
  createLenientTrendContentIdeasSchema,
  TREND_CONTENT_IDEAS_SCHEMA_NAME,
} from '@genfeedai/contracts/api-types/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** Minimal brand voice context for trend-idea prompts (#5219). */
export interface TrendIdeaBrandContext {
  label: string;
  description?: string;
  text?: string;
}

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
    brand?: TrendIdeaBrandContext,
    byokApiKeyOverride?: string,
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
          brand,
          byokApiKeyOverride,
        );

        ideasMap.set(platform, ideas);
      }
    } catch (error: unknown) {
      this.loggerService.warn('Trend idea generation failed', {
        code: 'trend_content_ideas_failed',
      });
      throw error;
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
   * Generate ideas for a specific platform
   */
  async generateIdeasForPlatform(
    platform: string,
    trends: TrendEntity[],
    count: number,
    onBilling?: (amount: number) => void,
    brand?: TrendIdeaBrandContext,
    byokApiKeyOverride?: string,
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
      // #5219: generation always runs in an explicit brand context. brand is
      // untrusted (label/description/text) same as the trend topics above.
      const brandContext = brand
        ? `\n\nWrite these ideas as this brand: ${this.sanitizeForPrompt(brand.label)}.${
            brand.description
              ? ` ${this.sanitizeForPrompt(brand.description)}`
              : ''
          }${brand.text ? ` ${this.sanitizeForPrompt(brand.text)}` : ''}`
        : '';

      const prompt = `Generate ${sanitizedCount} creative content ideas for ${sanitizedPlatform} based on these trending topics: ${sanitizedTopics}. Average virality score: ${avgVirality}/100.${brandContext}

For each idea, provide:
1. A catchy title
2. A brief description (1-2 sentences)
3. Content type (video, image, carousel, thread, or text)
4. Suggested hashtags (3-5)
5. A sample caption (1-2 sentences)
6. An optional nonnegative numeric estimatedViews estimate

The ideas field contains creative, engaging, platform-appropriate ideas.`;

      const result = await this.replicateService.generateStructuredTextSync(
        DEFAULT_TEXT_MODEL,
        {
          input: { max_completion_tokens: 2000 },
          prompt,
          schema: createLenientTrendContentIdeasSchema((dropped) =>
            this.loggerService.warn('Dropped invalid trend content ideas', {
              code: 'trend_content_ideas_items_dropped',
              dropped,
              droppedCount: dropped.length,
            }),
          ),
          schemaName: TREND_CONTENT_IDEAS_SCHEMA_NAME,
          onAttempt: onBilling
            ? async (input, output) => {
                onBilling(await this.calculateDefaultTextCharge(input, output));
              }
            : undefined,
        },
        byokApiKeyOverride,
      );
      return result.ideas.slice(0, sanitizedCount).map((idea) => ({
        title: idea.title,
        description: idea.description,
        contentType: idea.contentType,
        platform,
        ...(idea.hashtags != null ? { hashtags: idea.hashtags } : {}),
        ...(idea.caption != null ? { caption: idea.caption } : {}),
        ...(idea.estimatedViews != null
          ? { estimatedViews: idea.estimatedViews }
          : {}),
      }));
    } catch (error: unknown) {
      this.loggerService.warn('Trend idea generation failed', {
        code: 'trend_content_ideas_failed',
      });
      throw error;
    }
  }

  private async calculateDefaultTextCharge(
    input: Record<string, unknown>,
    output: string,
  ): Promise<number> {
    const model = await this.modelsService.findOne({
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
