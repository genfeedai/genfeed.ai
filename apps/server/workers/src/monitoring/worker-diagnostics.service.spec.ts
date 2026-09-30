import { EventEmitter } from 'node:events';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { WorkerHost } from '@nestjs/bullmq';
import type { DiscoveryService } from '@nestjs/core';
import type { ConfigService } from '@workers/config/config.service';
import {
  MAX_WORKER_DIAGNOSTIC_RECORDS,
  WORKER_DIAGNOSTIC_PREFIX,
  WORKER_DIAGNOSTIC_TTL_SECONDS,
  WorkerDiagnosticsService,
} from '@workers/monitoring/worker-diagnostics.service';
import type { Job, Worker } from 'bullmq';

class TestProcessor extends WorkerHost {
  constructor(private readonly observedWorker: Worker) {
    super();
  }

  override get worker() {
    return this.observedWorker;
  }

  async process() {}
}

describe('WorkerDiagnosticsService', () => {
  const logger = { log: vi.fn(), warn: vi.fn() };
  const transaction = {
    exec: vi.fn(),
    expire: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    zremrangebyrank: vi.fn().mockReturnThis(),
    zremrangebyscore: vi.fn().mockReturnThis(),
  };
  const redis = { getPublisher: vi.fn() };
  let worker: EventEmitter & { id: string; name: string; opts: object };
  let service: WorkerDiagnosticsService;
  const job = {
    attemptsMade: 0,
    attemptsStarted: 1,
    data: { secret: 'private-payload' },
    id: 'job-1',
    processedOn: 1_000,
    returnvalue: { secret: 'private-result' },
    stalledCounter: 0,
    token: 'private-token',
  } as unknown as Job;

  beforeEach(() => {
    vi.clearAllMocks();
    transaction.exec.mockResolvedValue([[null, 1]]);
    redis.getPublisher.mockReturnValue({ multi: () => transaction });
    worker = Object.assign(new EventEmitter(), {
      id: 'processing-worker-1',
      name: 'onboarding-starter-assets',
      opts: {
        connection: { password: 'private-password' },
        lockDuration: 30_000,
        lockRenewTime: 15_000,
        maxStalledCount: 1,
        stalledInterval: 30_000,
      },
    });
    const processor = new TestProcessor(worker as unknown as Worker);
    service = new WorkerDiagnosticsService(
      {
        getProviders: () => [
          { instance: processor },
          { instance: processor },
          { instance: {} },
        ],
      } as unknown as DiscoveryService,
      { isProduction: true } as ConfigService,
      redis as unknown as RedisService,
      logger as unknown as LoggerService,
    );
    service.onApplicationBootstrap();
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
  });

  function records() {
    return logger.log.mock.calls.map(([line]) => {
      expect(line).not.toContain('\n');
      return JSON.parse(line.slice('BullMQ worker evidence '.length));
    });
  }

  it('correlates processing attempts and completion without private fields', () => {
    worker.emit('active', job);
    worker.emit('completed', { ...job, finishedOn: 2_000 }, job.returnvalue);

    expect(records()).toEqual([
      expect.objectContaining({ event: 'started', lockDurationMs: 30_000 }),
      expect.objectContaining({
        attemptsStarted: 1,
        event: 'active',
        jobId: 'job-1',
        processingWorkerId: 'processing-worker-1',
        queueName: 'onboarding-starter-assets',
      }),
      expect.objectContaining({ event: 'completed', finishedOn: 2_000 }),
    ]);
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('private-');
    expect(JSON.stringify(transaction.zadd.mock.calls)).not.toContain(
      'private-',
    );
  });

  it('identifies a stall detector separately from its processing worker', () => {
    worker.emit('stalled', 'job-1');
    const record = records().at(-1);
    expect(record).toMatchObject({
      event: 'stalled',
      jobId: 'job-1',
      observerWorkerId: 'processing-worker-1',
    });
    expect(record).not.toHaveProperty('processingWorkerId');
  });

  it('records renewal loss, redelivery and terminal stall-limit failure', () => {
    worker.emit('lockRenewalFailed', ['job-1', 'job-2']);
    worker.emit('active', { ...job, attemptsStarted: 2, stalledCounter: 1 });
    worker.emit(
      'failed',
      job,
      new Error('job stalled more than allowable limit'),
    );
    worker.emit('failed', undefined, new Error('private-error-with-payload'));

    expect(
      records().filter((record) => record.event === 'lock-renewal-failed'),
    ).toHaveLength(2);
    expect(records()).toContainEqual(
      expect.objectContaining({
        attemptsStarted: 2,
        event: 'active',
        stalledCounter: 1,
      }),
    );
    expect(records()).toContainEqual(
      expect.objectContaining({ failureKind: 'stall-limit' }),
    );
    expect(records().at(-1)).toMatchObject({ failureKind: 'processor-error' });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('private-');
  });

  it('retains bounded evidence after recovery instead of replacing a snapshot', () => {
    worker.emit('stalled', 'job-1');
    worker.emit('completed', job);

    expect(transaction.zadd).toHaveBeenCalledWith(
      `${WORKER_DIAGNOSTIC_PREFIX}:onboarding-starter-assets`,
      expect.any(Number),
      expect.stringContaining('"event":"stalled"'),
    );
    expect(transaction.zadd).toHaveBeenCalledWith(
      `${WORKER_DIAGNOSTIC_PREFIX}:onboarding-starter-assets:incidents`,
      expect.any(Number),
      expect.stringContaining('"event":"stalled"'),
    );
    worker.emit('completed', { ...job, stalledCounter: 1 });
    expect(transaction.zadd).toHaveBeenCalledWith(
      `${WORKER_DIAGNOSTIC_PREFIX}:onboarding-starter-assets:incidents`,
      expect.any(Number),
      expect.stringContaining('"event":"completed"'),
    );
    expect(transaction.zremrangebyrank).toHaveBeenCalledWith(
      expect.any(String),
      0,
      -MAX_WORKER_DIAGNOSTIC_RECORDS - 1,
    );
    expect(transaction.expire).toHaveBeenCalledWith(
      expect.any(String),
      WORKER_DIAGNOSTIC_TTL_SECONDS,
    );
    expect(transaction.zremrangebyscore).toHaveBeenCalledWith(
      expect.any(String),
      '-inf',
      expect.any(Number),
    );
  });

  it('isolates Redis failures from worker execution and preserves log fallback', async () => {
    transaction.exec.mockRejectedValue(new Error('private-connection-string'));
    expect(() => worker.emit('active', job)).not.toThrow();
    expect(() => worker.emit('stalled', 'job-1')).not.toThrow();
    await service.onApplicationShutdown();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('private-');
  });

  it('attaches only once and keeps closing/closed evidence through drain', async () => {
    expect(worker.listenerCount('active')).toBe(1);
    worker.emit('closing');
    worker.emit('completed', job);
    worker.emit('closed');
    expect(
      records()
        .slice(-3)
        .map((record) => record.event),
    ).toEqual(['closing', 'completed', 'closed']);
    await service.onApplicationShutdown();
    expect(worker.listenerCount('active')).toBe(0);
    expect(worker.listenerCount('stalled')).toBe(0);
  });

  it('bounds pending archive work while preserving single-line evidence', async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    transaction.exec.mockClear();
    logger.log.mockClear();
    for (let index = 0; index < 150; index++) {
      worker.emit('active', { ...job, id: `job-${index}` });
    }
    expect(transaction.exec).toHaveBeenCalledTimes(90);
    expect(logger.log).toHaveBeenCalledTimes(150);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    worker.emit('stalled', 'job-incident');
    expect(transaction.exec).toHaveBeenCalledTimes(91);
    expect(transaction.zadd).toHaveBeenCalledWith(
      `${WORKER_DIAGNOSTIC_PREFIX}:onboarding-starter-assets:incidents`,
      expect.any(Number),
      expect.stringContaining('job-incident'),
    );
  });

  it('detects command-level archive errors and unavailable Redis', async () => {
    transaction.exec.mockResolvedValue([
      [new Error('private-redis-error'), null],
    ]);
    worker.emit('active', job);
    redis.getPublisher.mockReturnValue(null);
    worker.emit('completed', job);
    await service.onApplicationShutdown();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(records().at(-1)).toMatchObject({ event: 'completed' });
  });

  it('does not subscribe or archive outside production', async () => {
    const discovery = { getProviders: vi.fn() };
    const disabled = new WorkerDiagnosticsService(
      discovery as unknown as DiscoveryService,
      { isProduction: false } as ConfigService,
      redis as unknown as RedisService,
      logger as unknown as LoggerService,
    );
    const writes = transaction.exec.mock.calls.length;
    disabled.onApplicationBootstrap();
    await disabled.onApplicationShutdown();
    expect(discovery.getProviders).not.toHaveBeenCalled();
    expect(transaction.exec).toHaveBeenCalledTimes(writes);
  });

  it('does not prevent startup when a deferred worker is not initialized', async () => {
    class DeferredProcessor extends WorkerHost {
      async process() {}
    }
    const deferred = new WorkerDiagnosticsService(
      {
        getProviders: () => [{ instance: new DeferredProcessor() }],
      } as unknown as DiscoveryService,
      { isProduction: true } as ConfigService,
      redis as unknown as RedisService,
      logger as unknown as LoggerService,
    );
    expect(() => deferred.onApplicationBootstrap()).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'BullMQ worker evidence skipped: worker not initialized',
    );
    await deferred.onApplicationShutdown();
  });
});
