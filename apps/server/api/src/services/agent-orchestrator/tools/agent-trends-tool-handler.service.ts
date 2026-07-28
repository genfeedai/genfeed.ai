import { TrendsService } from '@api/collections/trends/services/trends.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

/**
 * Trends listing tool + summary card builder.
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentTrendsToolHandler {
  constructor(private readonly trendsService: TrendsService) {}

  async getTrends(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const platform = params.platform as string | undefined;

    const cachedTrends = await this.trendsService.getTrends(
      ctx.organizationId,
      undefined,
      platform,
      { allowFetchIfMissing: false },
    );
    const trends =
      cachedTrends.length > 0
        ? cachedTrends
        : await this.trendsService.getTrends(
            ctx.organizationId,
            undefined,
            platform,
            { allowFetchIfMissing: true },
          );

    return {
      creditsUsed: 0,
      data: {
        count: trends.length,
        trends: trends.slice(0, 20).map((t: Record<string, unknown>) => ({
          id: String(t.id),
          platform: t.platform,
          score: t.score,
          topic: t.topic ?? t.name,
        })),
      },
      nextActions: [
        this.buildTrendsSummaryCard(
          platform,
          trends as Record<string, unknown>[],
        ),
      ],
      success: true,
    };
  }

  formatQueueItemLabel(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      return null;
    }

    if (normalized === 'twitter' || normalized === 'x') {
      return 'X';
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  buildTrendsSummaryCard(
    platform: string | undefined,
    trends: Record<string, unknown>[],
  ) {
    const normalizedPlatform =
      typeof platform === 'string' ? platform.trim().toLowerCase() : '';
    const platformLabel =
      normalizedPlatform === 'tiktok'
        ? 'TikTok'
        : normalizedPlatform === 'youtube'
          ? 'YouTube'
          : normalizedPlatform === 'linkedin'
            ? 'LinkedIn'
            : this.formatQueueItemLabel(platform);
    const trendCount = trends.length;
    const title =
      trendCount === 0
        ? `${platformLabel ? `${platformLabel} trends` : 'Trends'} unavailable`
        : `${platformLabel ? `${platformLabel} trends` : 'Trends'} loaded`;
    const summaryText =
      trendCount === 0
        ? `No ${platformLabel ? `${platformLabel} trends` : 'trends'} are available in the cached corpus right now. Open trends analytics to confirm source coverage before retrying this task.`
        : `Loaded ${trendCount} ${platformLabel ? `${platformLabel} ` : ''}trend${trendCount === 1 ? '' : 's'} from the cached corpus. Open trends analytics to review the strongest hooks and decide what to remix.`;

    const outcomeBullets =
      trendCount === 0
        ? [
            `${platformLabel ? `${platformLabel} cached corpus` : 'Cached corpus'} returned 0 trends`,
            'Live fetch fallback is disabled for this tool',
          ]
        : trends.slice(0, 4).map((trend) => {
            const topic =
              typeof trend.topic === 'string' && trend.topic.trim().length > 0
                ? trend.topic.trim()
                : typeof trend.name === 'string' && trend.name.trim().length > 0
                  ? trend.name.trim()
                  : 'Untitled trend';
            const score =
              typeof trend.score === 'number' && Number.isFinite(trend.score)
                ? `score ${Math.round(trend.score)}`
                : null;

            return [topic, score]
              .filter((value): value is string => Boolean(value))
              .join(' · ');
          });

    return {
      id: `trends-${(platform ?? 'all').trim().toLowerCase() || 'all'}-${Date.now()}`,
      outcomeBullets,
      primaryCta: {
        href: '/analytics/trends',
        label: 'Open trends analytics',
      },
      status: 'completed' as const,
      summaryText,
      title,
      type: 'completion_summary_card' as const,
    };
  }
}
