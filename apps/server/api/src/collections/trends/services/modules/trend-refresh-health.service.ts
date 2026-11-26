import { randomUUID } from 'node:crypto';
import { writeNotificationOutbox } from '@api/services/activity-recording/notification-outbox.writer';
import { APIFY_ACTOR_IDS } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { TrendRefreshHealth } from '@genfeedai/contracts/interfaces';
import { withPlatformTenantArm } from '@libs/prisma/platform-scope';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const TREND_REFRESH_EVENT_TYPE = 'trend_refresh_health';
export const TREND_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
export const TREND_REFRESH_DATASETS = [
  ...['instagram', 'linkedin', 'pinterest', 'reddit', 'twitter', 'youtube'].map(
    (platform) => ({ dataset: 'trends' as const, platform }),
  ),
  ...['tiktok', 'youtube'].map((platform) => ({
    dataset: 'videos' as const,
    platform,
  })),
  ...['instagram', 'twitter'].map((platform) => ({
    dataset: 'hashtags' as const,
    platform,
  })),
  { dataset: 'sounds' as const, platform: 'tiktok' },
];

/**
 * Platforms whose native provider can never return trends, so a tenant-scoped
 * refresh (which forbids the Apify fallback) always records `native_unavailable`
 * and can never count as a success. Per-tenant health is meaningless for them;
 * only the platform-wide refresh, which may use the fallback, is monitored.
 * TikTok: the Display API lists the account's own uploads, not a trend feed.
 */
export const TREND_PLATFORMS_WITHOUT_NATIVE_FEED: readonly string[] = [
  'tiktok',
];

/** The paid actor behind each dataset whose scrape can pause, named in its incident. */
export const TREND_SCRAPE_ACTORS: Readonly<Record<string, string>> = {
  'instagram/hashtags': APIFY_ACTOR_IDS.INSTAGRAM_HASHTAG,
  'instagram/trends': APIFY_ACTOR_IDS.INSTAGRAM_HASHTAG,
  'tiktok/sounds': APIFY_ACTOR_IDS.TIKTOK_SCRAPER,
  'tiktok/videos': APIFY_ACTOR_IDS.TIKTOK_SCRAPER,
  'twitter/trends': APIFY_ACTOR_IDS.TWITTER_TRENDS,
};

/** Nightly refreshes (distinct UTC days) a paid scrape may return nothing before it is paused. */
const SCRAPE_EMPTY_DAYS_BEFORE_PAUSE = 3;
/** A paused scrape is tried once more after this long. */
const SCRAPE_PAUSE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
// Two ticks a day for a week, with room for retries.
const SCRAPE_HISTORY_LENGTH = 30;

export interface TrendScrapeBreaker {
  /** Distinct UTC days the scrape came back empty in a row. */
  emptyDays: number;
  /** The paid scrape is in an incident: empty three nights running, or its actor is gone. */
  isOpen: boolean;
  /** An open scrape is skipped until it has been quiet for a week. */
  isPaused: boolean;
  lastRunAt: string | null;
  reason: 'actor_unavailable' | 'empty' | null;
}

function sourceId(
  health: Pick<TrendRefreshHealth, 'platform' | 'dataset'>,
): string {
  return `refresh-health:${health.platform}:${health.dataset}`;
}

function readEvidence(output: unknown): TrendRefreshHealth | null {
  if (!output || typeof output !== 'object' || Array.isArray(output))
    return null;
  const record = output as Record<string, unknown>;
  if (
    !TREND_REFRESH_DATASETS.some(
      ({ dataset, platform }) =>
        record.dataset === dataset && record.platform === platform,
    )
  )
    return null;
  const outcome = [
    'native_available',
    'native_empty',
    'native_failed',
    'fallback_available',
    'fallback_empty',
    'fallback_failed',
  ].find((value) => value === record.outcome);
  const reason =
    [
      'native_empty',
      'native_failed',
      'native_unavailable',
      'provider_failed',
      'authentication_required',
      'access_required',
      'budget_exhausted',
      'rate_limited',
      'actor_unavailable',
      'persistence_failed',
    ].find((value) => value === record.reason) ?? null;
  if (!outcome || !['global', 'scoped'].includes(String(record.scope)))
    return null;
  const date = (value: unknown): string | null =>
    typeof value === 'string' && Number.isFinite(Date.parse(value))
      ? new Date(value).toISOString()
      : null;
  const lastAttemptAt = date(record.lastAttemptAt);
  const completedAt = date(record.completedAt);
  if (!lastAttemptAt || !completedAt) return null;
  return {
    completedAt,
    dataset: record.dataset as TrendRefreshHealth['dataset'],
    lastAttemptAt,
    lastSuccessfulRefreshAt: date(record.lastSuccessfulRefreshAt),
    outcome: outcome as TrendRefreshHealth['outcome'],
    platform: record.platform as string,
    reason: reason as TrendRefreshHealth['reason'],
    scope: record.scope as TrendRefreshHealth['scope'],
  };
}

/** Durable refresh receipts use the operational event journal; corpus-health never starts work. */
@Traced()
@Injectable()
export class TrendRefreshHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    organizationId: string | null,
    evidence: TrendRefreshHealth[],
  ): Promise<void> {
    for (const rawAttempt of evidence) {
      const attempt = readEvidence(rawAttempt);
      if (!attempt) continue;
      const prior = await this.latest(organizationId, attempt);
      const lastSuccessfulRefreshAt =
        [prior?.lastSuccessfulRefreshAt, attempt.lastSuccessfulRefreshAt]
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;
      await this.prisma.$transaction((transaction) =>
        writeNotificationOutbox(
          transaction,
          {
            deduplicationKey: `trend-refresh-health/${randomUUID()}`,
            eventKey: 'trend.refresh.completed',
            occurredAt: new Date(attempt.completedAt),
            organizationId,
            payload: { ...attempt, lastSuccessfulRefreshAt },
            sourceId: sourceId(attempt),
            sourceType: TREND_REFRESH_EVENT_TYPE,
          },
          [],
        ),
      );
    }
  }

  async getHealth(
    options: { organizationId?: string; platform?: string } = {},
  ): Promise<TrendRefreshHealth[]> {
    const organizations = [
      ...new Set([
        null,
        ...(options.organizationId ? [options.organizationId] : []),
      ]),
    ];
    const rows = await Promise.all(
      organizations.flatMap((organizationId) =>
        TREND_REFRESH_DATASETS.filter(
          (value) => !options.platform || value.platform === options.platform,
        ).map((dataset) => this.latest(organizationId, dataset)),
      ),
    );
    return rows.filter((row): row is TrendRefreshHealth => row !== null);
  }

  /**
   * Whether the paid scrape behind a global dataset is in an incident, read
   * from its own receipts. A paused refresh writes no receipt, so the newest
   * receipt is always a real run and a week after it the scrape is tried once
   * more. Items from that run break the streak and close the incident.
   */
  async getScrapeBreaker(
    dataset: Pick<TrendRefreshHealth, 'platform' | 'dataset'>,
    now: Date = new Date(),
  ): Promise<TrendScrapeBreaker> {
    const where = withPlatformTenantArm({
      isDeleted: false,
      organizationId: null,
      sourceId: sourceId(dataset),
      sourceType: TREND_REFRESH_EVENT_TYPE,
    });
    // tenant-scope-ignore: where names the platform null organization with the tenant proof from withPlatformTenantArm; isDeleted is false
    const rows = await this.prisma.notificationEvent.findMany({
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: { payload: true },
      take: SCRAPE_HISTORY_LENGTH,
      where,
    });
    const receipts = rows
      .map((row) => readEvidence(row.payload))
      .filter(
        (receipt): receipt is TrendRefreshHealth =>
          receipt !== null && receipt.scope === 'global',
      );
    const [latest] = receipts;
    if (!latest)
      return {
        emptyDays: 0,
        isOpen: false,
        isPaused: false,
        lastRunAt: null,
        reason: null,
      };
    const emptyDays = new Set<string>();
    for (const receipt of receipts) {
      if (receipt.outcome !== 'fallback_empty') break;
      emptyDays.add(receipt.lastAttemptAt.slice(0, 10));
    }
    const isGone = latest.reason === 'actor_unavailable';
    const isOpen = isGone || emptyDays.size >= SCRAPE_EMPTY_DAYS_BEFORE_PAUSE;
    const isQuiet =
      now.getTime() - Date.parse(latest.lastAttemptAt) < SCRAPE_PAUSE_RETRY_MS;
    return {
      emptyDays: emptyDays.size,
      isOpen,
      isPaused: isOpen && isQuiet,
      lastRunAt: latest.lastAttemptAt,
      reason: isGone ? 'actor_unavailable' : isOpen ? 'empty' : null,
    };
  }

  /** The nightly refresh skips a paid scrape while this is true. */
  async isScrapePaused(
    dataset: Pick<TrendRefreshHealth, 'platform' | 'dataset'>,
    now: Date = new Date(),
  ): Promise<boolean> {
    return (await this.getScrapeBreaker(dataset, now)).isPaused;
  }

  private async latest(
    organizationId: string | null,
    dataset: Pick<TrendRefreshHealth, 'platform' | 'dataset'>,
  ): Promise<TrendRefreshHealth | null> {
    // The platform-wide refresh evidence is read inside a tenant request, so
    // the guard needs the caller named; `organizationId: null` still decides.
    const where = withPlatformTenantArm({
      isDeleted: false,
      organizationId,
      sourceId: sourceId(dataset),
      sourceType: TREND_REFRESH_EVENT_TYPE,
    });
    const [row, successful] = await Promise.all([
      // tenant-scope-ignore: where names the organization (or the platform null with the tenant proof from withPlatformTenantArm); isDeleted is false
      this.prisma.notificationEvent.findFirst({
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: { payload: true },
        where,
      }),
      // tenant-scope-ignore: same where as the lookup above
      this.prisma.notificationEvent.findFirst({
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: { payload: true },
        where: {
          ...where,
          OR: [
            'native_available',
            'native_empty',
            'fallback_available',
            'fallback_empty',
          ].map((outcome) => ({
            payload: { path: ['outcome'], equals: outcome },
            ...(outcome === 'native_empty'
              ? {
                  NOT: {
                    payload: { path: ['reason'], equals: 'native_unavailable' },
                  },
                }
              : {}),
          })),
        },
      }),
    ]);
    const latest = readEvidence(row?.payload);
    if (latest)
      latest.lastSuccessfulRefreshAt =
        readEvidence(successful?.payload)?.lastSuccessfulRefreshAt ??
        latest.lastSuccessfulRefreshAt;
    return latest;
  }
}
