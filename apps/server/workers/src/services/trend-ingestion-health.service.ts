import { createHash } from 'node:crypto';
import {
  TREND_PLATFORMS_WITHOUT_NATIVE_FEED,
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

// The schedule runs once a day at 00:15 UTC. Only closed windows count.
const SCHEDULE_OFFSET_MS = 15 * 60 * 1000;
// Upper bound on simultaneous per-scope health queries in one cron run.
export const HEALTH_LOOKUP_CONCURRENCY = 10;
const ENROLLMENT_KEY = 'trend-ingestion-health/enrollment-v1';
const SOURCE_TYPE = 'trend_ingestion_health';
const DIGEST_SOURCE_ID = 'digest';
// One upsert per new incident runs inside the digest transaction, and a
// provider-wide scoped outage can add hundreds. Prisma's default is 5 seconds.
const DIGEST_TRANSACTION_TIMEOUT_MS = 30_000;
// Discord rejects an embed description over 4096 characters; stay well under.
const DIGEST_DESCRIPTION_BUDGET = 3600;
const DIGEST_ADVICE =
  'Inspect the trend maintenance queue, provider credentials and rate limits, then retry the affected datasets.';
const COLOR_MISSED = 0xef4444;
const COLOR_RECOVERED = 0x22c55e;

/** One incident change found during a run, held until the run posts one digest. */
export interface PendingIngestionAlert {
  /** One line for the digest; the advice that follows is shown once. */
  brief: string;
  description: string;
  isRecovery: boolean;
  key: string;
  sourceId: string;
  title: string;
}

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
          !platform ||
          !scope.organizationId ||
          TREND_PLATFORMS_WITHOUT_NATIVE_FEED.includes(platform) ||
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
    const globalMissedDatasets = new Set<string>();
    const alerts: PendingIngestionAlert[] = [];
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
        const recovered = `${dataset.platform} ${dataset.dataset} completed a refresh at ${successAt.toISOString()}.`;
        alerts.push({
          brief: recovered,
          description: recovered,
          isRecovery: true,
          key: `${previousAlert.deduplicationKey}/recovered`,
          sourceId,
          title: 'Trend ingestion recovered',
        });
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
      globalMissedDatasets.add(`${dataset.platform}/${dataset.dataset}`);
      const episode = baseline.toISOString();
      const attempt = `Last attempt: ${receipt?.lastAttemptAt ?? 'not recorded'}. Outcome: ${receipt?.outcome ?? 'not recorded'}.`;
      alerts.push({
        brief: `${dataset.platform} ${dataset.dataset}: no successful refresh. ${attempt}`,
        description: `${dataset.platform} ${dataset.dataset} has no successful refresh in two completed 24-hour windows. ${attempt} Inspect the trend maintenance queue, provider credentials and rate limits, then retry this dataset.`,
        isRecovery: false,
        key: `${alertPrefix}${episode}`,
        sourceId,
        title: 'Trend ingestion missed two scheduled windows',
      });
    }
    await this.alertScopedPlatforms(
      scopedTargets,
      globalMissedDatasets,
      twoWindowsAgo,
      alerts,
    );
    await this.postDigest(alerts, now);
  }

  // Scoped failures aggregate into one platform incident only while that
  // platform's global refresh is also missed (a provider-wide outage). While
  // global refreshes are healthy each tenant scope tracks its own incident, so
  // one tenant's persistent credential failure never hides another's. Tenant
  // identifiers stay out of operator text; per-scope ids are hashed.
  private async alertScopedPlatforms(
    targets: ScopedTarget[],
    globalMissedDatasets: Set<string>,
    twoWindowsAgo: number,
    alerts: PendingIngestionAlert[],
  ): Promise<void> {
    const byPlatform = new Map<string, ScopedTarget[]>();
    for (const target of targets) {
      const platformTargets = byPlatform.get(target.platform) ?? [];
      platformTargets.push(target);
      byPlatform.set(target.platform, platformTargets);
    }
    // Platforms with no remaining targets still need their open incidents closed.
    const platforms = new Set<string>(
      TREND_REFRESH_DATASETS.map((dataset) => dataset.platform),
    );
    for (const platform of platforms) {
      const platformTargets = byPlatform.get(platform) ?? [];
      const isGlobalOutage = globalMissedDatasets.has(`${platform}/trends`);
      const evaluated = platformTargets.map((target) => ({
        ...this.evaluateScope(target, twoWindowsAgo),
        sourceId: `${platform}/trends/scope-${createHash('sha256').update(target.organizationId).digest('hex').slice(0, 24)}`,
      }));
      const evaluatedBySource = new Map<string, typeof evaluated>();
      for (const entry of evaluated) {
        const sourceEvaluations = evaluatedBySource.get(entry.sourceId) ?? [];
        sourceEvaluations.push(entry);
        evaluatedBySource.set(entry.sourceId, sourceEvaluations);
      }
      const aggregateMissed = evaluated.filter((entry) => entry.isMissed);
      // Aggregate incident: closes as soon as the global outage ends.
      await this.reconcileIncident({
        alerts,
        brief: `${platform} trends: no successful refresh for ${aggregateMissed.length} of ${platformTargets.length} connected tenant scopes.`,
        description: `${platform} trends has no successful refresh in two completed 24-hour windows for ${aggregateMissed.length} of ${platformTargets.length} connected tenant scopes. Inspect the trend maintenance queue, provider credentials and rate limits, then retry this dataset.`,
        evaluated: isGlobalOutage ? evaluated : [],
        recoveredDescription: (latestSuccess) =>
          latestSuccess
            ? `${platform} trends completed a refresh for all connected tenant scopes at ${latestSuccess.toISOString()}.`
            : isGlobalOutage
              ? `${platform} trends has no connected tenant scopes still affected.`
              : `The platform-wide ${platform} trends outage has ended. Tenant scopes that still fail are reported on their own.`,
        sourceId: `${platform}/trends/scoped`,
      });
      // Per-scope incidents: every scope with a current or still-open incident
      // is reconciled, so disconnects and switches to aggregation close them.
      const scopePrefix = `${platform}/trends/scope-`;
      const openSourceIds = await this.findIncidentSourceIds(scopePrefix);
      const sourceIds = new Set<string>([
        ...openSourceIds,
        ...evaluated.map((entry) => entry.sourceId),
      ]);
      for (const sourceId of sourceIds) {
        const scoped = evaluatedBySource.get(sourceId) ?? [];
        const missedScope = scoped.find((entry) => entry.isMissed);
        await this.reconcileIncident({
          alerts,
          brief: `${platform} trends: no successful refresh for one connected tenant scope. ${this.describeScopeReceipt(missedScope?.receipt)}`,
          description: `${platform} trends has no successful refresh in two completed 24-hour windows for one connected tenant scope while the global refresh is healthy. ${this.describeScopeReceipt(missedScope?.receipt)} Inspect that tenant's provider credentials and rate limits, then retry this dataset.`,
          evaluated: isGlobalOutage ? [] : scoped,
          recoveredDescription: (latestSuccess) =>
            latestSuccess
              ? `${platform} trends completed a refresh for a previously failing tenant scope at ${latestSuccess.toISOString()}.`
              : `${platform} trends no longer has this tenant scope in a failing state.`,
          sourceId,
        });
      }
    }
  }

  private evaluateScope(target: ScopedTarget, twoWindowsAgo: number) {
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
  }

  // Tells the operator what the scope's last attempt actually did, so the
  // alert names the failure (for example authentication_required) instead of
  // sending them to guess between credentials and rate limits.
  private describeScopeReceipt(
    receipt: TrendRefreshHealth | undefined,
  ): string {
    if (!receipt)
      return 'No scoped refresh attempt is recorded for this scope, so the scoped refresh may not be scheduling it.';
    return `Last attempt: ${receipt.lastAttemptAt}. Outcome: ${receipt.outcome}${receipt.reason ? ` (${receipt.reason})` : ''}.`;
  }

  // Source ids with an alert and no recovery yet, under one prefix.
  private async findIncidentSourceIds(prefix: string): Promise<string[]> {
    const where = {
      isDeleted: false,
      organizationId: null,
      sourceId: { startsWith: prefix },
      sourceType: 'trend_ingestion_health',
    };
    const [alerts, recoveries] = await Promise.all([
      this.prisma.notificationEvent.findMany({
        select: { deduplicationKey: true, sourceId: true },
        where: {
          ...where,
          deduplicationKey: { not: { endsWith: '/recovered' } },
        },
      }),
      this.prisma.notificationEvent.findMany({
        select: { deduplicationKey: true },
        where: { ...where, deduplicationKey: { endsWith: '/recovered' } },
      }),
    ]);
    const recovered = new Set(recoveries.map((row) => row.deduplicationKey));
    return [
      ...new Set(
        alerts
          .filter((row) => !recovered.has(`${row.deduplicationKey}/recovered`))
          .map((row) => row.sourceId),
      ),
    ];
  }

  // One incident per source id: stable key from first miss until recovery, a
  // fresh key for an outage that starts after a recovery.
  private async reconcileIncident(input: {
    alerts: PendingIngestionAlert[];
    brief: string;
    description: string;
    evaluated: { baseline: Date; isMissed: boolean; successAt: Date | null }[];
    recoveredDescription: (latestSuccess: Date | null) => string;
    sourceId: string;
  }): Promise<void> {
    const { evaluated, sourceId } = input;
    const alertPrefix = `trend-ingestion-health/${sourceId}/missed/`;
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
        const recovered = input.recoveredDescription(latestSuccess);
        input.alerts.push({
          brief: recovered,
          description: recovered,
          isRecovery: true,
          key: `${previousAlert.deduplicationKey}/recovered`,
          sourceId,
          title: 'Trend ingestion recovered',
        });
      }
      return;
    }
    const episode = new Date(
      Math.max(
        missed.reduce(
          (earliest, entry) => Math.min(earliest, entry.baseline.getTime()),
          Number.POSITIVE_INFINITY,
        ),
        recoveryEvent?.occurredAt.getTime() ?? 0,
      ),
    ).toISOString();
    input.alerts.push({
      brief: input.brief,
      description: input.description,
      isRecovery: false,
      key:
        openIncident && previousAlert
          ? previousAlert.deduplicationKey
          : `${alertPrefix}${episode}`,
      sourceId,
      title: 'Trend ingestion missed two scheduled windows',
    });
  }

  /**
   * Posts everything this run found as one Discord message. Each incident still
   * gets its own event row, because the next run reads those rows to know which
   * incidents are open. Only incidents with no row yet are announced, so a
   * continuing outage stays silent. The rows and the digest commit together.
   */
  private async postDigest(
    alerts: PendingIngestionAlert[],
    now: Date,
  ): Promise<void> {
    if (alerts.length === 0) return;
    // One lookup for every key, so the transaction only writes. Keys are
    // deterministic and the writes are upserts, so a concurrent run cannot
    // duplicate an incident row.
    const known = new Set(
      (
        await this.prisma.notificationEvent.findMany({
          select: { deduplicationKey: true },
          where: {
            deduplicationKey: { in: alerts.map((alert) => alert.key) },
            isDeleted: false,
            organizationId: null,
          },
        })
      ).map((row) => row.deduplicationKey),
    );
    const fresh = alerts.filter((alert) => !known.has(alert.key));
    if (fresh.length === 0) return;
    const commit = await this.prisma.$transaction(
      async (transaction) => {
        for (const alert of fresh) {
          await writeNotificationOutbox(
            transaction,
            {
              deduplicationKey: alert.key,
              eventKey: alert.isRecovery
                ? 'trend.ingestion-health.recovered'
                : 'trend.ingestion-health.missed',
              occurredAt: now,
              organizationId: null,
              payload: { description: alert.description, title: alert.title },
              sourceId: alert.sourceId,
              sourceType: SOURCE_TYPE,
            },
            [],
          );
        }
        return this.activityRecorder.dispatchInTransaction(transaction, {
          deduplicationKey: `trend-ingestion-health/digest/${createHash(
            'sha256',
          )
            .update(
              fresh
                .map((alert) => alert.key)
                .sort()
                .join('\n'),
            )
            .digest('hex')
            .slice(0, 24)}`,
          messages: [
            {
              destination: null,
              message: {
                action: 'ingestion_health',
                payload: { card: this.buildDigestCard(fresh) },
                type: 'discord',
              },
            },
          ],
          occurredAt: now,
          organizationId: null,
          source: { id: DIGEST_SOURCE_ID, type: SOURCE_TYPE },
          topic: 'operator.alerts',
        });
      },
      { timeout: DIGEST_TRANSACTION_TIMEOUT_MS },
    );
    await this.activityRecorder.afterCommit(commit);
  }

  private buildDigestCard(alerts: PendingIngestionAlert[]): {
    color: number;
    description: string;
    title: string;
  } {
    const [only] = alerts;
    if (alerts.length === 1 && only) {
      return {
        color: only.isRecovery ? COLOR_RECOVERED : COLOR_MISSED,
        description: only.description,
        title: only.title,
      };
    }
    const missed = alerts.filter((alert) => !alert.isRecovery);
    const recovered = alerts.filter((alert) => alert.isRecovery);
    let budget = DIGEST_DESCRIPTION_BUDGET;
    const section = (heading: string, rows: PendingIngestionAlert[]) => {
      if (rows.length === 0) return null;
      const lines: string[] = [];
      for (const row of rows) {
        const line = `• ${row.brief}`;
        if (budget - line.length < 0) break;
        budget -= line.length + 1;
        lines.push(line);
      }
      const hidden = rows.length - lines.length;
      if (hidden > 0) lines.push(`…and ${hidden} more`);
      return `**${heading} (${rows.length})**\n${lines.join('\n')}`;
    };
    const parts =
      missed.length > 0 && recovered.length > 0
        ? [`${missed.length} need attention`, `${recovered.length} recovered`]
        : [];
    return {
      color: missed.length > 0 ? COLOR_MISSED : COLOR_RECOVERED,
      description: [
        section('Missed two scheduled windows', missed),
        missed.length > 0 ? DIGEST_ADVICE : null,
        section('Recovered', recovered),
      ]
        .filter((part): part is string => part !== null)
        .join('\n\n'),
      title:
        parts.length > 0
          ? `Trend ingestion: ${parts.join(', ')}`
          : missed.length > 0
            ? `Trend ingestion: ${missed.length} missed two scheduled windows`
            : `Trend ingestion: ${recovered.length} recovered`,
    };
  }
}
