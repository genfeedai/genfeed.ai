import {
  CloudWatchClient,
  type MetricDatum,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { ALL_QUEUE_NAMES, hasQueueConsumer } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import type { OperationalQueueHealthSnapshot } from '@workers/monitoring/queue-health.types';
import { QueueHealthMonitorService } from '@workers/monitoring/queue-health-monitor.service';
import {
  buildStalledJobLogContext,
  extractBullMqNamedEvents,
  MAX_STALLED_JOB_IDS,
  STALLED_JOB_LOG_MESSAGE,
} from '@workers/monitoring/queue-stall';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';

const METRIC_NAMESPACE = 'Genfeed/Queues';
const COLLECTION_WINDOW_MS = 5 * 60 * 1000;
const PUBLISH_MARKER_PREFIX = 'genfeed:monitoring:queue-metrics';

// These queues are owned by the files runtime and are not yet part of the
// shared queue-contracts package. Preserve their aggregate CloudWatch coverage
// without treating them as API/worker alert contracts.
const FILE_QUEUE_NAMES = [
  'file-processing',
  'image-processing',
  'task-processing',
  'video-processing',
  'youtube-processing',
] as const;

export const QUEUE_HEALTH_QUEUE_NAMES = ALL_QUEUE_NAMES;

const MONITORED_QUEUE_NAMES = [
  ...QUEUE_HEALTH_QUEUE_NAMES,
  ...FILE_QUEUE_NAMES,
] as const;

interface OperationalQueueSnapshot extends OperationalQueueHealthSnapshot {
  failedEvents: number;
}

interface AggregateQueueSnapshot {
  failedEvents: number;
  oldestWaitingAgeSeconds: number;
  stalledEvents: number;
  waiting: number;
}

@Injectable()
export class QueueMetricsService implements OnModuleDestroy {
  private readonly cloudWatch: CloudWatchClient;
  private readonly context = { service: QueueMetricsService.name };
  private collecting = false;
  private queues: Queue[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
    private readonly queueHealthMonitor: QueueHealthMonitorService,
  ) {
    this.cloudWatch = new CloudWatchClient({
      region: String(this.configService.get('AWS_REGION') || 'us-west-1'),
    });
  }

  async publishQueueMetrics(): Promise<void> {
    if (!this.configService.isProduction || this.collecting) {
      return;
    }

    const redis = this.redisService.getPublisher();
    if (!redis) {
      this.logger.warn(
        'Queue metrics skipped because Redis is unavailable',
        this.context,
      );
      return;
    }

    this.collecting = true;

    try {
      const collectionBucket = Math.floor(Date.now() / COLLECTION_WINDOW_MS);
      const acquired = await redis.set(
        `${PUBLISH_MARKER_PREFIX}:${collectionBucket}`,
        '1',
        'PX',
        COLLECTION_WINDOW_MS * 2,
        'NX',
      );
      if (acquired !== 'OK') {
        return;
      }

      this.ensureQueues(redis);
      const results = await Promise.allSettled(
        this.queues.map((queue) => this.collectQueue(queue, redis)),
      );
      const snapshots = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );

      if (snapshots.length === 0) {
        throw new Error('No BullMQ queue snapshot succeeded');
      }

      const failedQueueCount = results.length - snapshots.length;
      if (failedQueueCount > 0) {
        this.logger.warn(
          `Queue metrics collected with ${failedQueueCount} queue failures`,
          this.context,
        );
      }

      const [metricResult, healthResult] = await Promise.allSettled([
        this.publishAggregateMetrics(snapshots),
        this.queueHealthMonitor.processSnapshots(snapshots, redis),
      ]);

      if (metricResult.status === 'rejected') {
        this.logger.error(
          'Failed to publish aggregate BullMQ metrics',
          metricResult.reason,
          this.context,
        );
      }
      if (healthResult.status === 'rejected') {
        this.logger.error(
          'Failed to process BullMQ queue health snapshots',
          healthResult.reason,
          this.context,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        'Failed to collect BullMQ queue health',
        error,
        this.context,
      );
    } finally {
      this.collecting = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.queues.map((queue) => queue.close()));
    this.cloudWatch.destroy();
  }

  private ensureQueues(redis: Redis): void {
    if (this.queues.length > 0) {
      return;
    }

    this.queues = MONITORED_QUEUE_NAMES.map(
      (name) => new Queue(name, { connection: redis }),
    );
  }

  private async collectQueue(
    queue: Queue,
    redis: Redis,
  ): Promise<OperationalQueueSnapshot> {
    const now = Date.now();
    const [counts, oldestWaitingJobs, events] = await Promise.all([
      queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      queue.getJobs(['waiting'], 0, 0, true),
      redis.xrange(
        queue.toKey('events'),
        `${now - COLLECTION_WINDOW_MS}-0`,
        '+',
      ),
    ]);
    const oldestWaitingTimestamp = oldestWaitingJobs[0]?.timestamp;
    const stalled = extractBullMqNamedEvents(events, 'stalled');
    const stalledJobIds = stalled.jobIds.slice(0, MAX_STALLED_JOB_IDS);

    if (stalled.count > 0) {
      this.logStalledEvents(queue.name, stalled.count, stalledJobIds);
    }

    return {
      active: counts.active ?? 0,
      capturedAt: new Date(now).toISOString(),
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      failedEvents: this.countEvents(events, 'failed'),
      oldestWaitingAgeSeconds: oldestWaitingTimestamp
        ? Math.max(0, Math.floor((now - oldestWaitingTimestamp) / 1000))
        : 0,
      queueName: queue.name,
      stalledEvents: stalled.count,
      stalledJobIds,
      waiting: counts.waiting ?? 0,
    };
  }

  private async publishAggregateMetrics(
    snapshots: OperationalQueueSnapshot[],
  ): Promise<void> {
    // A queue nobody drains is a missing consumer, not an incident. Feeding one
    // into the aggregate MAX pins `OldestWaitingAgeSeconds` at the age of its
    // oldest job forever, which latches the alarm and destroys its ability to
    // report a real backlog. Alert on the queues a worker actually serves.
    const alertingSnapshots = snapshots.filter((snapshot) =>
      hasQueueConsumer(snapshot.queueName),
    );
    const totals = alertingSnapshots.reduce<AggregateQueueSnapshot>(
      (aggregate, snapshot) => ({
        failedEvents: aggregate.failedEvents + snapshot.failedEvents,
        oldestWaitingAgeSeconds: Math.max(
          aggregate.oldestWaitingAgeSeconds,
          snapshot.oldestWaitingAgeSeconds,
        ),
        stalledEvents: aggregate.stalledEvents + snapshot.stalledEvents,
        waiting: aggregate.waiting + snapshot.waiting,
      }),
      {
        failedEvents: 0,
        oldestWaitingAgeSeconds: 0,
        stalledEvents: 0,
        waiting: 0,
      },
    );

    await this.cloudWatch.send(
      new PutMetricDataCommand({
        MetricData: [
          ...this.buildMetricData(totals),
          ...this.buildPerQueueBacklogMetrics(snapshots),
          ...this.buildPerQueueStalledMetrics(snapshots),
        ],
        Namespace: METRIC_NAMESPACE,
      }),
    );
  }

  private countEvents(
    events: Array<[id: string, fields: string[]]>,
    eventName: string,
  ): number {
    return events.reduce((count, event) => {
      const fields = event[1];

      for (let index = 0; index < fields.length; index += 2) {
        if (fields[index] === 'event' && fields[index + 1] === eventName) {
          return count + 1;
        }
      }

      return count;
    }, 0);
  }

  private buildMetricData(snapshot: AggregateQueueSnapshot): MetricDatum[] {
    const dimensions = [{ Name: 'Service', Value: 'workers' }];
    const metrics: MetricDatum[] = [
      { MetricName: 'Heartbeat', Unit: 'Count', Value: 1 },
      { MetricName: 'WaitingJobs', Unit: 'Count', Value: snapshot.waiting },
      {
        MetricName: 'OldestWaitingAgeSeconds',
        Unit: 'Seconds',
        Value: snapshot.oldestWaitingAgeSeconds,
      },
      {
        MetricName: 'FailedJobs5m',
        Unit: 'Count',
        Value: snapshot.failedEvents,
      },
      {
        MetricName: 'StalledJobs5m',
        Unit: 'Count',
        Value: snapshot.stalledEvents,
      },
    ];

    return metrics.map((metric) => ({
      ...metric,
      Dimensions: dimensions,
      StorageResolution: 60,
    }));
  }

  /**
   * Aggregate metrics answer "is something stuck" but never "which queue". That
   * gap is why the 2026-08-10 oldest-waiting alarm could not be triaged from
   * CloudWatch at all. Emit a `Queue`-dimensioned datum for every queue holding
   * work so the offender is named on the dashboard.
   */
  private buildPerQueueBacklogMetrics(
    snapshots: OperationalQueueSnapshot[],
  ): MetricDatum[] {
    return snapshots
      .filter((snapshot) => snapshot.waiting > 0)
      .flatMap((snapshot) => {
        const dimensions = [
          { Name: 'Service', Value: 'workers' },
          { Name: 'Queue', Value: snapshot.queueName },
        ];

        return [
          {
            Dimensions: dimensions,
            MetricName: 'WaitingJobs',
            StorageResolution: 60,
            Unit: 'Count',
            Value: snapshot.waiting,
          },
          {
            Dimensions: dimensions,
            MetricName: 'OldestWaitingAgeSeconds',
            StorageResolution: 60,
            Unit: 'Seconds',
            Value: snapshot.oldestWaitingAgeSeconds,
          },
        ];
      });
  }

  private buildPerQueueStalledMetrics(
    snapshots: OperationalQueueSnapshot[],
  ): MetricDatum[] {
    return snapshots
      .filter((snapshot) => snapshot.stalledEvents > 0)
      .map((snapshot) => ({
        Dimensions: [
          { Name: 'Service', Value: 'workers' },
          { Name: 'Queue', Value: snapshot.queueName },
        ],
        MetricName: 'StalledJobs5m',
        StorageResolution: 60,
        Unit: 'Count',
        Value: snapshot.stalledEvents,
      }));
  }

  private logStalledEvents(
    queueName: string,
    stalledEvents: number,
    stalledJobIds: string[],
  ): void {
    if (stalledJobIds.length === 0) {
      this.logger.warn(
        STALLED_JOB_LOG_MESSAGE,
        buildStalledJobLogContext({
          queueName,
          service: this.context.service,
          stalledEvents,
        }),
      );
      return;
    }

    for (const jobId of stalledJobIds) {
      this.logger.warn(
        STALLED_JOB_LOG_MESSAGE,
        buildStalledJobLogContext({
          jobId,
          queueName,
          service: this.context.service,
        }),
      );
    }
  }
}
