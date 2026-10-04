import { randomUUID } from 'node:crypto';
import { writeNotificationOutbox } from '@api/services/activity-recording/notification-outbox.writer';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { TrendRefreshHealth } from '@genfeedai/contracts/interfaces';
import { withPlatformTenantArm } from '@libs/prisma/platform-scope';
import { Injectable } from '@nestjs/common';

export const TREND_REFRESH_EVENT_TYPE = 'trend_refresh_health';
export const TREND_REFRESH_WINDOW_MS = 12 * 60 * 60 * 1000;
export const TREND_REFRESH_DATASETS = [
  ...[
    'instagram',
    'linkedin',
    'pinterest',
    'reddit',
    'tiktok',
    'twitter',
    'youtube',
  ].map((platform) => ({ dataset: 'trends' as const, platform })),
  ...['instagram', 'reddit', 'tiktok', 'youtube'].map((platform) => ({
    dataset: 'videos' as const,
    platform,
  })),
  ...['instagram', 'tiktok', 'twitter'].map((platform) => ({
    dataset: 'hashtags' as const,
    platform,
  })),
  { dataset: 'sounds' as const, platform: 'tiktok' },
];

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
      this.prisma.notificationEvent.findFirst({
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: { payload: true },
        where,
      }),
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
