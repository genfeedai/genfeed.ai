import { TrendsService } from '@api/collections/trends/services/trends.service';
import {
  type ContentDraft,
  type SkillExecutionContext,
  type SkillHandler,
} from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TrendDiscoveryHandler implements SkillHandler {
  constructor(private readonly trendsService: TrendsService) {}

  async execute(
    context: SkillExecutionContext,
    params: Record<string, unknown>,
  ): Promise<ContentDraft> {
    const platform =
      typeof params.platform === 'string' ? params.platform : undefined;

    const response = await this.trendsService.getTrendsWithAccessControl(
      context.organizationId,
      context.brandId,
      platform,
    );

    const topTrends = response.trends.slice(0, 5);

    const remixSuggestions = topTrends
      .map((trend, index) => {
        const hashtags = Array.isArray(trend.metadata?.hashtags)
          ? trend.metadata.hashtags.slice(0, 3).join(' ')
          : '';

        return `${index + 1}. ${trend.topic} (${trend.platform}) - Remix angle: ${context.brandVoice}. ${hashtags}`;
      })
      .join('\n');

    return {
      confidence: 0.74,
      content:
        remixSuggestions || 'No active trends matched this brand right now.',
      metadata: {
        connectedPlatforms: response.connectedPlatforms,
        lockedPlatforms: response.lockedPlatforms,
        trendCount: response.trends.length,
      },
      platforms: context.platforms,
      skillSlug: 'trend-discovery',
      type: 'trend-report',
    };
  }
}
