import { monitorEventLoopDelay } from 'node:perf_hooks';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { WorkerHost } from '@nestjs/bullmq';
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { ConfigService } from '@workers/config/config.service';
import type { Job, Worker } from 'bullmq';

export const WORKER_DIAGNOSTIC_PREFIX = 'genfeed:monitoring:worker-evidence';
export const WORKER_DIAGNOSTIC_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MAX_WORKER_DIAGNOSTIC_RECORDS = 5_000;
const MAX_PENDING_WRITES = 100;

type DiagnosticEvent =
  | 'active'
  | 'completed'
  | 'failed'
  | 'stalled'
  | 'lock-renewal-failed'
  | 'started'
  | 'closing'
  | 'closed';

@Injectable()
export class WorkerDiagnosticsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly delay = monitorEventLoopDelay({ resolution: 20 });
  private readonly detach: Array<() => void> = [];
  private readonly pending = new Set<Promise<void>>();
  private archiveWarningLogged = false;
  private delayWindowStartedAt = Date.now();
  private delayResetTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.isProduction) return;
    this.delay.enable();
    this.delayResetTimer = setInterval(() => {
      this.delay.reset();
      this.delayWindowStartedAt = Date.now();
    }, 30_000);
    this.delayResetTimer.unref();
    const attached = new Set<Worker>();
    for (const provider of this.discovery.getProviders()) {
      const instance: unknown = provider.instance;
      if (!(instance instanceof WorkerHost)) continue;
      let worker: Worker;
      try {
        worker = instance.worker;
      } catch {
        // A manually registered or deferred worker must not make optional
        // diagnostics prevent the runtime from starting.
        this.logger.warn(
          'BullMQ worker evidence skipped: worker not initialized',
        );
        continue;
      }
      if (attached.has(worker)) continue;
      attached.add(worker);
      this.attach(worker);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    // BullExplorer drains workers in onModuleDestroy, before this hook. Keep
    // listeners attached through that drain so final outcomes are preserved.
    for (const detach of this.detach) detach();
    clearInterval(this.delayResetTimer);
    this.delay.disable();
    // Diagnostics must not turn an unavailable Redis archive into an
    // unbounded shutdown wait. Worker drain has already completed.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled(this.pending),
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, 500);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  private attach(worker: Worker): void {
    const active = (job: Job) => this.record(worker, 'active', job);
    const completed = (job: Job) => this.record(worker, 'completed', job);
    const failed = (job: Job | undefined, error: Error) =>
      this.record(worker, 'failed', job, undefined, error);
    const stalled = (jobId: string) =>
      this.record(worker, 'stalled', undefined, jobId);
    const renewalFailed = (jobIds: string[]) => {
      for (const jobId of jobIds) {
        this.record(worker, 'lock-renewal-failed', undefined, jobId);
      }
    };
    const closing = () => this.record(worker, 'closing');
    const closed = () => this.record(worker, 'closed');
    worker.on('active', active);
    worker.on('completed', completed);
    worker.on('failed', failed);
    worker.on('stalled', stalled);
    worker.on('lockRenewalFailed', renewalFailed);
    worker.on('closing', closing);
    worker.on('closed', closed);
    this.detach.push(() => {
      worker.off('active', active);
      worker.off('completed', completed);
      worker.off('failed', failed);
      worker.off('stalled', stalled);
      worker.off('lockRenewalFailed', renewalFailed);
      worker.off('closing', closing);
      worker.off('closed', closed);
    });
    this.record(worker, 'started');
  }

  private record(
    worker: Worker,
    event: DiagnosticEvent,
    job?: Job,
    jobId?: string,
    error?: Error,
  ): void {
    const now = Date.now();
    // Never serialize a Job, result, raw error, connection options or token.
    // A stalled event names its detector, not the prior lock owner. Correlate
    // with the same job's active event to identify its processing worker.
    const record = JSON.stringify({
      attemptsMade: job?.attemptsMade,
      attemptsStarted: job?.attemptsStarted,
      capturedAt: new Date(now).toISOString(),
      event,
      eventLoopDelayMaxMs: Number.isFinite(this.delay.max)
        ? Math.round(this.delay.max / 1_000_000)
        : 0,
      eventLoopWindowStartedAt: new Date(
        this.delayWindowStartedAt,
      ).toISOString(),
      failureKind: error
        ? error.message.includes('job stalled more than allowable limit')
          ? 'stall-limit'
          : error.message.includes('Missing lock')
            ? 'missing-lock'
            : 'processor-error'
        : undefined,
      finishedOn: job?.finishedOn,
      jobId: job?.id ?? jobId,
      lockDurationMs: worker.opts.lockDuration,
      lockRenewTimeMs: worker.opts.lockRenewTime,
      maxStalledCount: worker.opts.maxStalledCount,
      observerWorkerId: event === 'stalled' ? worker.id : undefined,
      processingWorkerId: event === 'stalled' ? undefined : worker.id,
      processedOn: job?.processedOn,
      queueName: worker.name,
      retryConfiguredAttempts: job?.opts?.attempts,
      stalledCounter: job?.stalledCounter,
      stalledIntervalMs: worker.opts.stalledInterval,
    });
    // One physical log line: nestLike's metadata output is split by awslogs.
    this.logger.log(`BullMQ worker evidence ${record}`);
    if (this.pending.size >= MAX_PENDING_WRITES) {
      this.warnArchiveUnavailable();
      return;
    }
    const write = this.archive(worker.name, now, record);
    this.pending.add(write);
    void write.finally(() => this.pending.delete(write));
  }

  private async archive(queueName: string, now: number, record: string) {
    const redis = this.redis.getPublisher();
    if (!redis) {
      this.warnArchiveUnavailable();
      return;
    }
    try {
      const key = `${WORKER_DIAGNOSTIC_PREFIX}:${queueName}`;
      const results = await redis
        .multi()
        .zadd(key, now, record)
        .zremrangebyscore(
          key,
          '-inf',
          now - WORKER_DIAGNOSTIC_TTL_SECONDS * 1_000,
        )
        .zremrangebyrank(key, 0, -MAX_WORKER_DIAGNOSTIC_RECORDS - 1)
        .expire(key, WORKER_DIAGNOSTIC_TTL_SECONDS)
        .exec();
      if (!results || results.some(([error]) => error !== null)) {
        this.warnArchiveUnavailable();
      }
    } catch {
      this.warnArchiveUnavailable();
    }
  }

  private warnArchiveUnavailable(): void {
    if (this.archiveWarningLogged) return;
    this.archiveWarningLogged = true;
    this.logger.warn('BullMQ worker evidence archive unavailable; use logs');
  }
}
