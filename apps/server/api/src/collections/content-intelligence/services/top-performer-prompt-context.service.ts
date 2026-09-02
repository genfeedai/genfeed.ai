import {
  type PerformanceContentItem,
  PerformanceSummaryService,
} from '@api/collections/content-performance/services/performance-summary.service';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';
import { rankByQueryOverlap } from '@api/services/agent-context-assembly/text-overlap.util';
import { Injectable } from '@nestjs/common';

export interface TopPerformerPromptContextParams {
  organizationId: string;
  brandId?: string;
  platform?: string;
  query?: string;
  limit?: number;
}

@Injectable()
export class TopPerformerPromptContextService {
  constructor(
    private readonly performanceSummaryService: PerformanceSummaryService,
  ) {}

  async assembleContext(
    params: TopPerformerPromptContextParams,
  ): Promise<string | undefined> {
    if (!params.brandId) {
      return undefined;
    }

    const limit = params.limit ?? 5;
    const summary = await this.performanceSummaryService.getWeeklySummary(
      params.organizationId,
      params.brandId,
      { topN: limit, worstN: limit },
    );

    const topPerformers = rankByQueryOverlap(
      this.filterByPlatform(summary.topPerformers, params.platform),
      params.query ?? '',
      (item) => `${item.title} ${item.description}`,
    );
    const worstPerformers = rankByQueryOverlap(
      this.filterByPlatform(summary.worstPerformers, params.platform),
      params.query ?? '',
      (item) => `${item.title} ${item.description}`,
    );

    const sections: string[] = [];
    const positiveSignals = [
      ...summary.topHooks
        .slice(0, 3)
        .map(
          (hook) =>
            `Reuse hook structure like "${SecurityUtil.sanitizePromptInput(hook, 120)}".`,
        ),
      ...summary.avgEngagementByContentType
        .slice(0, 2)
        .map(
          (item) =>
            `Favor ${SecurityUtil.sanitizePromptInput(item.category, 80)} formats (${item.avgEngagementRate.toFixed(2)}% avg engagement).`,
        ),
      ...summary.bestPostingTimes
        .slice(0, 2)
        .map(
          (item) =>
            `When timing matters, ${this.formatHour(item.hour)} has historically performed well (${item.avgEngagementRate.toFixed(2)}% avg engagement).`,
        ),
    ];

    if (topPerformers.length > 0) {
      positiveSignals.push(
        ...topPerformers.slice(0, 3).map((item) => {
          const label = this.describeContentItem(item);
          return `Model winning example "${label}" (${item.engagementRate.toFixed(2)}% engagement).`;
        }),
      );
    }

    if (positiveSignals.length > 0) {
      sections.push(
        [
          '## Historical Performance Context',
          ...positiveSignals.slice(0, 8).map((signal) => `- ${signal}`),
        ].join('\n'),
      );
    }

    if (worstPerformers.length > 0) {
      const antiPatterns = worstPerformers.slice(0, 3).map((item) => {
        const label = this.describeContentItem(item);
        return `Avoid repeating underperforming angle "${label}" (${item.engagementRate.toFixed(2)}% engagement).`;
      });
      sections.push(
        [
          '## Historical Anti-Patterns',
          ...antiPatterns.map((signal) => `- ${signal}`),
        ].join('\n'),
      );
    }

    if (sections.length === 0) {
      return undefined;
    }

    return sections.join('\n\n');
  }

  private filterByPlatform(
    items: PerformanceContentItem[],
    platform?: string,
  ): PerformanceContentItem[] {
    if (!platform) {
      return items;
    }

    const normalizedPlatform = platform.toLowerCase();
    const platformItems = items.filter(
      (item) => item.platform.toLowerCase() === normalizedPlatform,
    );

    return platformItems.length > 0 ? platformItems : items;
  }

  private describeContentItem(item: PerformanceContentItem): string {
    const rawLabel = item.title || item.description || item.postId;
    return SecurityUtil.sanitizePromptInput(rawLabel, 140);
  }

  private formatHour(hour: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour || 12;
    return `${displayHour}${period}`;
  }
}
