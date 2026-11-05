import { TREND_REFRESH_DATASETS } from '@api/collections/trends/services/modules/trend-refresh-health.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { formatPlatformLabel } from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const MAX_TRENDS = 20;
const TIMEFRAME_HOURS = { '24h': 24, '30d': 720, '7d': 168 } as const;
type TrendsTimeframe = keyof typeof TIMEFRAME_HOURS;
const TREND_PLATFORMS = TREND_REFRESH_DATASETS.filter(
  ({ dataset }) => dataset === 'trends',
).map(({ platform }) => platform);

function readTrendsTimeframe(value: unknown): TrendsTimeframe {
  return typeof value === 'string' && value in TIMEFRAME_HOURS
    ? (value as TrendsTimeframe)
    : '24h';
}

function toIsoDate(value: Date | string | undefined): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Highest score first inside each platform, then one per platform in turn. */
function interleaveByPlatform<T extends { platform: string; score?: number }>(
  items: T[],
  limit: number,
): T[] {
  const queues = new Map<string, T[]>();
  for (const item of items) {
    queues.set(item.platform, [...(queues.get(item.platform) ?? []), item]);
  }
  for (const queue of queues.values()) {
    queue.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
  const result: T[] = [];
  while (result.length < limit && [...queues.values()].some((q) => q.length)) {
    for (const queue of queues.values()) {
      const next = queue.shift();
      if (next && result.length < limit) result.push(next);
    }
  }
  return result;
}

/**
 * Trends listing tool + summary card builder.
 * Extracted from AgentToolExecutorService per #519.
 */
@Traced()
@Injectable()
export class AgentTrendsToolHandler {
  constructor(private readonly trendsService: TrendsService) {}

  async getTrends(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const platform =
      typeof params.platform === 'string' && params.platform.trim()
        ? params.platform.trim().toLowerCase()
        : undefined;
    const timeframe = readTrendsTimeframe(params.timeframe);

    // Without a platform the cached corpus is read per platform. One merged
    // read ranks by virality score, which is not comparable across platforms,
    // so a single platform could fill the whole answer.
    const platforms = platform ? [platform] : TREND_PLATFORMS;
    const cached = (
      await Promise.all(
        platforms.map((value) =>
          this.trendsService.getTrends(ctx.organizationId, undefined, value, {
            allowFetchIfMissing: false,
          }),
        ),
      )
    ).flat();

    const windowStart = Date.now() - TIMEFRAME_HOURS[timeframe] * 3_600_000;
    const dated = cached.map((trend) => ({
      id: String(trend.id),
      platform: trend.platform,
      score: trend.viralityScore,
      topic: trend.topic,
      updatedAt: toIsoDate(trend.updatedAt ?? trend.createdAt),
    }));
    const inWindow = dated.filter(
      (trend) =>
        trend.updatedAt !== null && Date.parse(trend.updatedAt) >= windowStart,
    );
    const trends = interleaveByPlatform(inWindow, MAX_TRENDS);
    const newestUpdatedAt =
      dated
        .map((trend) => trend.updatedAt)
        .filter((value): value is string => value !== null)
        .sort()
        .at(-1) ?? null;

    return {
      creditsUsed: 0,
      data: {
        count: inWindow.length,
        newestUpdatedAt,
        timeframe,
        trends,
      },
      nextActions: [
        this.buildTrendsSummaryCard(
          platform,
          trends,
          inWindow.length === 0 && newestUpdatedAt
            ? { newestUpdatedAt, timeframe }
            : undefined,
        ),
      ],
      success: true,
    };
  }

  buildTrendsSummaryCard(
    platform: string | undefined,
    trends: Record<string, unknown>[],
    staleCorpus?: { newestUpdatedAt: string; timeframe: string },
  ) {
    const platformLabel = formatPlatformLabel(platform);
    const trendCount = trends.length;
    const title =
      trendCount === 0
        ? `${platformLabel ? `${platformLabel} trends` : 'Trends'} unavailable`
        : `${platformLabel ? `${platformLabel} trends` : 'Trends'} loaded`;
    const summaryText =
      trendCount === 0
        ? `No ${platformLabel ? `${platformLabel} trends` : 'trends'} are available in the cached corpus right now. Open Discovery trends to confirm source coverage before retrying this task.`
        : `Loaded ${trendCount} ${platformLabel ? `${platformLabel} ` : ''}trend${trendCount === 1 ? '' : 's'} from the cached corpus. Open Discovery trends to review the strongest hooks and decide what to remix.`;

    const outcomeBullets =
      trendCount === 0
        ? [
            staleCorpus
              ? `No trends were refreshed in the last ${staleCorpus.timeframe}; the newest cached trend is from ${staleCorpus.newestUpdatedAt}`
              : `${platformLabel ? `${platformLabel} cached corpus` : 'Cached corpus'} returned 0 trends`,
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
        href: '/discovery/trends',
        label: 'Open trends',
      },
      status: 'completed' as const,
      summaryText,
      title,
      type: 'completion_summary_card' as const,
    };
  }
}
