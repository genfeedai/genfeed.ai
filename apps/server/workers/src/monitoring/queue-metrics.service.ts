import {
  CloudWatchClient,
  type MetricDatum,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { ALL_QUEUE_NAMES } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@workers/config/config.service';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';

const METRIC_NAMESPACE = 'Genfeed/Queues';
const COLLECTION_WINDOW_MS = 5 * 60 * 1000;
const PUBLISH_MARKER_PREFIX = 'genfeed:monitoring:queue-metrics';

// These queues are owned by the files runtime and are not yet part of the
// shared queue-contracts package. They still use the same production Redis and
// are included in the aggregate without becoming metric dimensions.
const FILE_QUEUE_NAMES = [
  'file-processing',
  'image-processing',
  'task-processing',
  'video-processing',
  'youtube-processing',
] as const;

const MONITORED_QUEUE_NAMES = [
  ...ALL_QUEUE_NAMES,
  ...FILE_QUEUE_NAMES,
] as const;

interface QueueSnapshot {
  active: number;
  delayed: number;
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
  ) {
    this.cloudWatch = new CloudWatchClient({
      region: String(this.configService.get('AWS_REGION') || 'us-west-1'),
    });
  }

  @Cron('*/5 * * * *')
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

      const totals = snapshots.reduce<QueueSnapshot>(
        (aggregate, snapshot) => ({
          active: aggregate.active + snapshot.active,
          delayed: aggregate.delayed + snapshot.delayed,
          failedEvents: aggregate.failedEvents + snapshot.failedEvents,
          oldestWaitingAgeSeconds: Math.max(
            aggregate.oldestWaitingAgeSeconds,
            snapshot.oldestWaitingAgeSeconds,
          ),
          stalledEvents: aggregate.stalledEvents + snapshot.stalledEvents,
          waiting: aggregate.waiting + snapshot.waiting,
        }),
        {
          active: 0,
          delayed: 0,
          failedEvents: 0,
          oldestWaitingAgeSeconds: 0,
          stalledEvents: 0,
          waiting: 0,
        },
      );

      const failedQueueCount = results.length - snapshots.length;
      if (failedQueueCount > 0) {
        this.logger.warn(
          `Queue metrics collected with ${failedQueueCount} queue failures`,
          this.context,
        );
      }

      await this.cloudWatch.send(
        new PutMetricDataCommand({
          MetricData: this.buildMetricData(totals),
          Namespace: METRIC_NAMESPACE,
        }),
      );
    } catch (error: unknown) {
      this.logger.error(
        'Failed to publish aggregate BullMQ metrics',
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
  ): Promise<QueueSnapshot> {
    const now = Date.now();
    const [counts, waitingJobs, events] = await Promise.all([
      queue.getJobCounts(),
      queue.getWaiting(0, 0),
      redis.xrange(
        queue.toKey('events'),
        `${now - COLLECTION_WINDOW_MS}-0`,
        '+',
      ),
    ]);
    const oldestWaitingTimestamp = waitingJobs[0]?.timestamp;

    return {
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failedEvents: this.countEvents(events, 'failed'),
      oldestWaitingAgeSeconds: oldestWaitingTimestamp
        ? Math.max(0, (now - oldestWaitingTimestamp) / 1000)
        : 0,
      stalledEvents: this.countEvents(events, 'stalled'),
      waiting: counts.waiting ?? 0,
    };
  }

  private countEvents(events: string[][], eventName: string): number {
    return events.reduce((count, event) => {
      const fields = event[1] ?? [];

      for (let index = 0; index < fields.length; index += 2) {
        if (fields[index] === 'event' && fields[index + 1] === eventName) {
          return count + 1;
        }
      }

      return count;
    }, 0);
  }

  private buildMetricData(snapshot: QueueSnapshot): MetricDatum[] {
    const dimensions = [{ Name: 'Service', Value: 'workers' }];
    const metrics: MetricDatum[] = [
      { MetricName: 'Heartbeat', Unit: 'Count', Value: 1 },
      { MetricName: 'WaitingJobs', Unit: 'Count', Value: snapshot.waiting },
      { MetricName: 'ActiveJobs', Unit: 'Count', Value: snapshot.active },
      { MetricName: 'DelayedJobs', Unit: 'Count', Value: snapshot.delayed },
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
}
