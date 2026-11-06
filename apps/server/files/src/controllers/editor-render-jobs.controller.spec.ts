import { EditorRenderJobsController } from '@files/controllers/editor-render-jobs.controller';
import type { VideoQueueService } from '@files/queues/video-queue.service';
import type { RemotionRenderCancellationService } from '@files/services/remotion/remotion-render-cancellation.service';
import type { RemotionRenderJobService } from '@files/services/remotion/remotion-render-job.service';
import { FILE_JOB_TYPES as JOB_TYPES } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';

const REQUESTED_AT = '2026-11-05T12:00:00.000Z';

/**
 * The cancel endpoint over a queue holding one job, a durable cancellation
 * marker store, the cancellation broadcast, and a logger that keeps warnings.
 */
function controllerWith(job: {
  name?: string;
  removeFails?: boolean;
  state: string;
}) {
  const world = {
    broadcasts: [] as Array<[string, string]>,
    markers: [] as Array<[string, string]>,
    queue: new Map([['job-123', job]]),
    warnings: [] as unknown[],
  };
  const queuedJob = (id: string) => {
    const stored = world.queue.get(id);
    return stored
      ? {
          getState: async () => stored.state,
          id,
          name: stored.name ?? JOB_TYPES.RENDER_EDITOR_COMPOSITION,
          remove: async () => {
            if (stored.removeFails) {
              throw new Error('locked');
            }
            world.queue.delete(id);
          },
        }
      : undefined;
  };
  const controller = new EditorRenderJobsController(
    {
      getJob: async (id: string) => queuedJob(id),
    } as unknown as VideoQueueService,
    {
      requestCancellation: async (
        cancelled: { id: string },
        requestedAt: string,
      ) => {
        world.markers.push([cancelled.id, requestedAt]);
      },
    } as unknown as RemotionRenderJobService,
    {
      request: async (jobId: string, requestedAt: string) => {
        world.broadcasts.push([jobId, requestedAt]);
      },
    } as unknown as RemotionRenderCancellationService,
    {
      warn: (_message: string, detail: unknown) => {
        world.warnings.push(detail);
      },
    } as unknown as LoggerService,
  );
  return { controller, world };
}

async function cancelFailure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof HttpException)) {
    throw new Error('Expected the cancel to reject with an HttpException');
  }
  return { message: error.message, status: error.getStatus() };
}

describe('EditorRenderJobsController', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(REQUESTED_AT));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks and broadcasts cancellation for an active render and leaves the worker its job', async () => {
    const { controller, world } = controllerWith({ state: 'active' });

    const result = await controller.cancel('job-123');

    expect(result).toEqual({
      jobId: 'job-123',
      requestedAt: REQUESTED_AT,
      status: 'cancellation-requested',
    });
    expect(world.markers).toEqual([['job-123', REQUESTED_AT]]);
    expect(world.broadcasts).toEqual([['job-123', REQUESTED_AT]]);
    expect([...world.queue.keys()]).toEqual(['job-123']);
  });

  it.each(['waiting', 'delayed'])(
    'removes a %s render from the queue after marking it cancelled',
    async (state) => {
      const { controller, world } = controllerWith({ state });

      await controller.cancel('job-123');

      expect(world.markers).toEqual([['job-123', REQUESTED_AT]]);
      expect([...world.queue.keys()]).toEqual([]);
    },
  );

  it('still answers when the worker grabbed the job before it could be removed', async () => {
    const { controller, world } = controllerWith({
      removeFails: true,
      state: 'waiting',
    });

    const result = await controller.cancel('job-123');

    expect(result.status).toBe('cancellation-requested');
    expect(world.broadcasts).toEqual([['job-123', REQUESTED_AT]]);
    expect(world.warnings).toEqual([{ jobId: 'job-123', reason: 'Error' }]);
  });

  it.each([
    ['completed', HttpStatus.CONFLICT, 'Editor render job is already terminal'],
    ['failed', HttpStatus.CONFLICT, 'Editor render job is already terminal'],
  ])(
    'rejects cancelling a %s render without marking it',
    async (state, status, message) => {
      const { controller, world } = controllerWith({ state });

      expect(await cancelFailure(controller.cancel('job-123'))).toEqual({
        message,
        status,
      });
      expect(world.markers).toEqual([]);
      expect(world.broadcasts).toEqual([]);
    },
  );

  it.each([
    ['an unknown job', 'job-missing', undefined],
    ['a job that is not an editor render', 'job-123', 'render-video'],
  ])('answers 404 for %s', async (_case, jobId, name) => {
    const { controller, world } = controllerWith({ name, state: 'waiting' });

    expect(await cancelFailure(controller.cancel(jobId))).toEqual({
      message: 'Editor render job not found',
      status: HttpStatus.NOT_FOUND,
    });
    expect(world.markers).toEqual([]);
  });
});
