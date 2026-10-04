import {
  TREND_REFRESH_DATASETS,
  TREND_REFRESH_WINDOW_MS,
  TrendRefreshHealthService,
} from '@api/collections/trends/services/modules/trend-refresh-health.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { writeNotificationOutbox } from '@api/services/activity-recording/notification-outbox.writer';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createConcurrencyLimit } from '@api/shared/utils/create-concurrency-limit.util';
import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';
import type { TrendRefreshHealth } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

// The existing schedule runs at 00:15 and 12:15 UTC. Only closed windows count.
const SCHEDULE_OFFSET_MS = 15 * 60 * 1000;
// Upper bound on simultaneous per-scope health queries in one cron run.
export const HEALTH_LOOKUP_CONCURRENCY = 10;
const ENROLLMENT_KEY = 'trend-ingestion-health/enrollment-v1';

interface ScopedTarget {
  dataset: 'trends';
  enrollmentAt: Date;
  health: TrendRefreshHealth[];
  organizationId: string;
  platform: string;
}

@Injectable()
export class TrendIngestionHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshHealth: TrendRefreshHealthService,
    private readonly activityRecorder: ActivityRecorderService,
  ) {}

  async checkMissedWindows(now: Date): Promise<void> {
    // A durable rollout baseline prevents treating old count-only executions as failures.
    const enrollment = await this.prisma.$transaction(async (transaction) => {
      const { eventId } = await writeNotificationOutbox(
        transaction,
        {
          deduplicationKey: ENROLLMENT_KEY,
          eventKey: 'trend.ingestion-health.enrolled',
          occurredAt: now,
          organizationId: null,
          payload: { version: 1 },
          sourceId: 'enrollment',
          sourceType: 'trend_ingestion_health',
        },
        [],
      );
      return transaction.notificationEvent.findFirstOrThrow({
        select: { occurredAt: true },
        where: { id: eventId, isDeleted: false, organizationId: null },
      });
    });
    const globalHealth = await this.refreshHealth.getHealth();
    // Platform maintenance intentionally discovers connected scopes across tenants.
    const scopes = await this.prisma.credential.findMany({
      distinct: ['organizationId', 'platform'],
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, organizationId: true, platform: true },
      where: {
        brandId: { not: null },
        isConnected: true,
        isDeleted: false,
        organizationId: { not: null },
      },
    });
    const limit = createConcurrencyLimit(HEALTH_LOOKUP_CONCURRENCY);
    const globalTargets = TREND_REFRESH_DATASETS.map((dataset) => ({
      ...dataset,
      enrollmentAt: enrollment.occurredAt,
      health: globalHealth,
    }));
    const scopedTargets = await Promise.all(
      scopes.flatMap((scope) => {
        const platform = fromPrismaCredentialPlatform(scope.platform);
        if (
          !scope.organizationId ||
          !TREND_REFRESH_DATASETS.some(
            (dataset) => dataset.platform === platform,
          )
        )
          return [];
        const organizationId = scope.organizationId;
        return [
          limit(() =>
            this.refreshHealth.getHealth({ organizationId, platform }),
          ).then((health) => ({
            dataset: 'trends' as const,
            enrollmentAt:
              scope.createdAt > enrollment.occurredAt
                ? scope.createdAt
                : enrollment.occurredAt,
            health,
            organizationId,
            platform,
          })),
        ];
      }),
    );
    const targets = [...globalTargets];
    const closedBefore =
      Math.floor(
        (now.getTime() - SCHEDULE_OFFSET_MS) / TREND_REFRESH_WINDOW_MS,
      ) *
        TREND_REFRESH_WINDOW_MS +
      SCHEDULE_OFFSET_MS;
    const twoWindowsAgo = closedBefore - 2 * TREND_REFRESH_WINDOW_MS;
    for (const dataset of targets) {
      const receipt = dataset.health.find(
        (row) =>
          row.scope === 'global' &&
          row.platform === dataset.platform &&
          row.dataset === dataset.dataset,
      );
      const successAt = receipt?.lastSuccessfulRefreshAt
        ? new Date(receipt.lastSuccessfulRefreshAt)
        : null;
      const sourceId = `${dataset.platform}/${dataset.dataset}`;
      const alertPrefix = `trend-ingestion-health/${sourceId}/missed/`;
      const previousAlert = await this.prisma.notificationEvent.findFirst({
        orderBy: { occurredAt: 'desc' },
        select: { deduplicationKey: true, occurredAt: true },
        where: {
          deduplicationKey: {
            startsWith: alertPrefix,
            not: { endsWith: '/recovered' },
          },
          isDeleted: false,
          organizationId: null,
          sourceId,
          sourceType: 'trend_ingestion_health',
        },
      });
      if (previousAlert && successAt && successAt > previousAlert.occurredAt) {
        await this.send(
          `${previousAlert.deduplicationKey}/recovered`,
          sourceId,
          now,
          'Trend ingestion recovered',
          `${dataset.platform} ${dataset.dataset} completed a refresh at ${successAt.toISOString()}.`,
          true,
        );
      }
      // Empty and fallback responses are successful completed refreshes. Failed
      // or absent work cannot advance the timestamp or reset the incident.
      const baseline =
        successAt && successAt > dataset.enrollmentAt
          ? successAt
          : dataset.enrollmentAt;
      // A completion at the exact opening boundary belongs to that window.
      // Enrollment itself is not a successful refresh.
      if (successAt && successAt.getTime() >= twoWindowsAgo) continue;
      if (baseline.getTime() > twoWindowsAgo) continue;
      const episode = baseline.toISOString();
      await this.send(
        `${alertPrefix}${episode}`,
        sourceId,
        now,
        'Trend ingestion missed two scheduled windows',
        `${dataset.platform} ${dataset.dataset} has no successful refresh in two completed 12-hour windows. Last attempt: ${receipt?.lastAttemptAt ?? 'not recorded'}. Outcome: ${receipt?.outcome ?? 'not recorded'}. Inspect the trend maintenance queue, provider credentials and rate limits, then retry this dataset.`,
        false,
      );
    }
    await this.alertScopedPlatforms(scopedTargets, twoWindowsAgo, now);
  }

  // One provider outage affects many tenants at once. Alert once per platform
  // and outage window with the affected count; tenant identifiers stay out of
  // operator text, matching the per-scope alerts this replaces.
  private async alertScopedPlatforms(
    targets: ScopedTarget[],
    twoWindowsAgo: number,
    now: Date,
  ): Promise<void> {
    const byPlatform = new Map<string, ScopedTarget[]>();
    for (const target of targets) {
      byPlatform.set(target.platform, [
        ...(byPlatform.get(target.platform) ?? []),
        target,
      ]);
    }
    // Platforms with no remaining targets still need their open incident closed.
    const platforms = new Set<string>(
      TREND_REFRESH_DATASETS.map((dataset) => dataset.platform),
    );
    for (const platform of platforms) {
      const platformTargets = byPlatform.get(platform) ?? [];
      const sourceId = `${platform}/trends/scoped`;
      const alertPrefix = `trend-ingestion-health/${sourceId}/missed/`;
      const evaluated = platformTargets.map((target) => {
        const receipt = target.health.find(
          (row) =>
            row.scope === 'scoped' &&
            row.platform === target.platform &&
            row.dataset === target.dataset,
        );
        const successAt = receipt?.lastSuccessfulRefreshAt
          ? new Date(receipt.lastSuccessfulRefreshAt)
          : null;
        const baseline =
          successAt && successAt > target.enrollmentAt
            ? successAt
            : target.enrollmentAt;
        const isMissed =
          !(successAt && successAt.getTime() >= twoWindowsAgo) &&
          baseline.getTime() <= twoWindowsAgo;
        return { baseline, isMissed, receipt, successAt };
      });
      const missed = evaluated.filter((entry) => entry.isMissed);
      const previousAlert = await this.prisma.notificationEvent.findFirst({
        orderBy: { occurredAt: 'desc' },
        select: { deduplicationKey: true, occurredAt: true },
        where: {
          deduplicationKey: {
            startsWith: alertPrefix,
            not: { endsWith: '/recovered' },
          },
          isDeleted: false,
          organizationId: null,
          sourceId,
          sourceType: 'trend_ingestion_health',
        },
      });
      const latestSuccess = evaluated.reduce<Date | null>(
        (latest, entry) =>
          entry.successAt && (!latest || entry.successAt > latest)
            ? entry.successAt
            : latest,
        null,
      );
      // The incident key stays stable from the first miss until full recovery,
      // so scopes recovering or disconnecting never re-open the same outage.
      const recoveryEvent =
        previousAlert &&
        (await this.prisma.notificationEvent.findFirst({
          select: { deduplicationKey: true, occurredAt: true },
          where: {
            deduplicationKey: `${previousAlert.deduplicationKey}/recovered`,
            isDeleted: false,
            organizationId: null,
            sourceId,
            sourceType: 'trend_ingestion_health',
          },
        }));
      const openIncident = previousAlert && !recoveryEvent;
      if (missed.length === 0) {
        if (openIncident && previousAlert) {
          await this.send(
            `${previousAlert.deduplicationKey}/recovered`,
            sourceId,
            now,
            'Trend ingestion recovered',
            latestSuccess
              ? `${platform} trends completed a refresh for all connected tenant scopes at ${latestSuccess.toISOString()}.`
              : `${platform} trends has no connected tenant scopes still affected.`,
            true,
          );
        }
        continue;
      }
      // A new outage after a recovery must not reuse the recovered incident's key.
      const episode = new Date(
        Math.max(
          Math.min(...missed.map((entry) => entry.baseline.getTime())),
          recoveryEvent?.occurredAt.getTime() ?? 0,
        ),
      ).toISOString();
      const incidentKey =
        openIncident && previousAlert
          ? previousAlert.deduplicationKey
          : `${alertPrefix}${episode}`;
      await this.send(
        incidentKey,
        sourceId,
        now,
        'Trend ingestion missed two scheduled windows',
        `${platform} trends has no successful refresh in two completed 12-hour windows for ${missed.length} of ${platformTargets.length} connected tenant scopes. Inspect the trend maintenance queue, provider credentials and rate limits, then retry this dataset.`,
        false,
      );
    }
  }

  private async send(
    key: string,
    sourceId: string,
    now: Date,
    title: string,
    description: string,
    isRecovery: boolean,
  ): Promise<void> {
    await this.activityRecorder.dispatch({
      deduplicationKey: key,
      messages: [
        {
          destination: null,
          message: {
            action: 'ingestion_health',
            payload: {
              card: {
                color: isRecovery ? 0x22c55e : 0xef4444,
                description,
                title,
              },
            },
            type: 'discord',
          },
        },
      ],
      occurredAt: now,
      organizationId: null,
      source: { id: sourceId, type: 'trend_ingestion_health' },
      topic: 'operator.alerts',
    });
  }
}
