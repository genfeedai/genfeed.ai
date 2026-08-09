import { ActionOrigin } from '@genfeedai/enums';
import {
  POST_PUBLISH_JOB_NAME,
  type PostPublishJobData,
} from '@genfeedai/queue-contracts';
import { runWithActionOrigin } from '@server/action-origin/action-origin.context';
import type { ServerLogger } from '@server/server.dependencies';
import type { Queue } from 'bullmq';
import { PostPublishQueueService } from './post-publish-queue.service';

type EnqueueInput = Omit<PostPublishJobData, 'enqueuedAt'>;

function createHarness(queueOverrides: Partial<Queue> = {}) {
  const add = vi.fn().mockResolvedValue({ id: 'job-1' });
  const getJob = vi.fn().mockResolvedValue(null);
  const queue = {
    add,
    getJob,
    ...queueOverrides,
  } as unknown as Queue<PostPublishJobData>;
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;

  return {
    add,
    getJob,
    logger,
    queue,
    service: new PostPublishQueueService(queue, logger),
  };
}

function makeInput(overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  return {
    organizationId: 'org-1',
    postId: 'post-1',
    ...overrides,
  } as EnqueueInput;
}

describe('PostPublishQueueService.enqueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enqueues under the post id with a deterministic job id', async () => {
    const { add, service } = createHarness();

    await expect(service.enqueue(makeInput())).resolves.toBe('job-1');

    expect(add).toHaveBeenCalledWith(
      POST_PUBLISH_JOB_NAME,
      expect.objectContaining({
        enqueuedAt: '2026-08-01T00:00:00.000Z',
        postId: 'post-1',
      }),
      {
        attempts: 1,
        jobId: 'post-1',
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
  });

  it('prefers the operation id as the deterministic job id', async () => {
    const { add, service } = createHarness();

    await service.enqueue(makeInput({ operationId: 'op-7' }));

    expect(add).toHaveBeenCalledWith(
      POST_PUBLISH_JOB_NAME,
      expect.anything(),
      expect.objectContaining({ jobId: 'op-7' }),
    );
  });

  it('stamps a WORKFLOW origin for the scheduled sweep', async () => {
    const { add, service } = createHarness();

    await service.enqueue(makeInput({ source: 'scheduled_sweep' }));

    expect(add).toHaveBeenCalledWith(
      POST_PUBLISH_JOB_NAME,
      expect.objectContaining({
        actionContext: expect.objectContaining({
          origin: ActionOrigin.WORKFLOW,
        }),
      }),
      expect.anything(),
    );
  });

  it('carries an explicitly supplied action context through untouched', async () => {
    const { add, service } = createHarness();

    await service.enqueue(
      makeInput({ actionContext: { origin: ActionOrigin.AGENT } }),
    );

    expect(add).toHaveBeenCalledWith(
      POST_PUBLISH_JOB_NAME,
      expect.objectContaining({
        actionContext: expect.objectContaining({ origin: ActionOrigin.AGENT }),
      }),
      expect.anything(),
    );
  });

  it('inherits the ambient action origin context when none is supplied', async () => {
    const { add, service } = createHarness();

    await runWithActionOrigin({ origin: ActionOrigin.AGENT }, () =>
      service.enqueue(makeInput()),
    );

    expect(add).toHaveBeenCalledWith(
      POST_PUBLISH_JOB_NAME,
      expect.objectContaining({
        actionContext: expect.objectContaining({ origin: ActionOrigin.AGENT }),
      }),
      expect.anything(),
    );
  });

  it('degrades to returning the job id when no queue is wired', async () => {
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } satisfies ServerLogger;
    const service = new PostPublishQueueService(undefined, logger);

    await expect(service.enqueue(makeInput())).resolves.toBe('post-1');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('queue unavailable'),
      { jobId: 'post-1', postId: 'post-1' },
    );
  });

  it('skips the enqueue when an in-flight job already holds the id', async () => {
    const { add, getJob, logger, service } = createHarness();
    getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue('active'),
      remove: vi.fn(),
    });

    await expect(service.enqueue(makeInput())).resolves.toBe('post-1');

    expect(add).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('post already queued'),
      expect.objectContaining({ state: 'active' }),
    );
  });

  it('reclaims the id from a stale terminal job', async () => {
    const { add, getJob, service } = createHarness();
    const remove = vi.fn().mockResolvedValue(undefined);
    getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue('completed'),
      remove,
    });

    await service.enqueue(makeInput());

    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('falls back to the deterministic id when BullMQ returns no job id', async () => {
    const { add, service } = createHarness();
    add.mockResolvedValue({ id: undefined });

    await expect(service.enqueue(makeInput())).resolves.toBe('post-1');
  });
});
