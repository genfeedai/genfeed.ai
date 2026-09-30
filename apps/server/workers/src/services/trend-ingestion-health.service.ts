import { createHash } from 'node:crypto';
import {
  TREND_REFRESH_DATASETS,
  TREND_REFRESH_WINDOW_MS,
  TrendRefreshHealthService,
} from '@api/collections/trends/services/modules/trend-refresh-health.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { writeNotificationOutbox } from '@api/services/activity-recording/notification-outbox.writer';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

// The existing schedule runs at 00:15 and 12:15 UTC. Only closed windows count.
const SCHEDULE_OFFSET_MS = 15 * 60 * 1000;
const ENROLLMENT_KEY = 'trend-ingestion-health/enrollment-v1';

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
    const targets = [
      ...TREND_REFRESH_DATASETS.map((dataset) => ({
        ...dataset,
        enrollmentAt: enrollment.occurredAt,
        organizationId: null as string | null,
        health: globalHealth,
      })),
      ...(await Promise.all(
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
            this.refreshHealth
              .getHealth({ organizationId, platform })
              .then((health) => ({
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
      )),
    ];
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
          row.scope === (dataset.organizationId ? 'scoped' : 'global') &&
          row.platform === dataset.platform &&
          row.dataset === dataset.dataset,
      );
      const successAt = receipt?.lastSuccessfulRefreshAt
        ? new Date(receipt.lastSuccessfulRefreshAt)
        : null;
      const scopeKey = dataset.organizationId
        ? `/scope-${createHash('sha256').update(dataset.organizationId).digest('hex').slice(0, 24)}`
        : '';
      const sourceId = `${dataset.platform}/${dataset.dataset}${scopeKey}`;
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
