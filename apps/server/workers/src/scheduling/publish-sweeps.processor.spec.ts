import { PUBLISH_SWEEP_QUEUE } from '@genfeedai/contracts/queue';
import { PlatformPublishingTaskHandlers } from '@workers/scheduling/platform-publishing-task-handlers.service';
import {
  PLATFORM_SCHEDULE_CATALOG,
  PLATFORM_SCHEDULED_TASKS,
  PUBLISH_SWEEP_TASKS,
} from '@workers/scheduling/platform-schedules.constants';
import { PublishSweepsProcessor } from '@workers/scheduling/publish-sweeps.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PublishSweepsProcessor', () => {
  const config = { isDevSchedulersEnabled: true };
  const logger = { debug: vi.fn(), warn: vi.fn() };
  const posts = { publishScheduledPosts: vi.fn().mockResolvedValue(undefined) };
  const threadComments = {
    publishDueThreadComments: vi.fn().mockResolvedValue(undefined),
  };
  const unused = {} as never;

  let processor: PublishSweepsProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    config.isDevSchedulersEnabled = true;
    processor = new PublishSweepsProcessor(
      config as never,
      logger as never,
      new PlatformPublishingTaskHandlers(
        posts as never,
        unused,
        threadComments as never,
        unused,
        unused,
        unused,
        unused,
        unused,
        unused,
        unused,
        unused,
        unused,
        unused,
        unused,
        unused,
      ),
    );
  });

  it('runs the post sweep for a posts-publish tick', async () => {
    await processor.process({
      name: PLATFORM_SCHEDULED_TASKS.POSTS_PUBLISH,
    } as Job);

    expect(posts.publishScheduledPosts).toHaveBeenCalledOnce();
    expect(threadComments.publishDueThreadComments).not.toHaveBeenCalled();
  });

  it('runs the thread comment sweep for a posts-thread-comments tick', async () => {
    await processor.process({
      name: PLATFORM_SCHEDULED_TASKS.POSTS_THREAD_COMMENTS,
    } as Job);

    expect(threadComments.publishDueThreadComments).toHaveBeenCalledOnce();
    expect(posts.publishScheduledPosts).not.toHaveBeenCalled();
  });

  it('skips a task that is not a publishing sweep without failing the job', async () => {
    await expect(
      processor.process({ name: 'crun-task-reconcile' } as Job),
    ).resolves.toBeUndefined();

    expect(posts.publishScheduledPosts).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('crun-task-reconcile'),
      expect.any(String),
    );
  });

  it('does nothing when local schedulers are disabled', async () => {
    config.isDevSchedulersEnabled = false;

    await processor.process({
      name: PLATFORM_SCHEDULED_TASKS.POSTS_PUBLISH,
    } as Job);

    expect(posts.publishScheduledPosts).not.toHaveBeenCalled();
  });

  it('only owns tasks that have a schedule, every minute', () => {
    expect(PUBLISH_SWEEP_QUEUE).toBe('publish-sweeps');
    for (const taskName of PUBLISH_SWEEP_TASKS) {
      expect(PLATFORM_SCHEDULE_CATALOG[taskName].pattern).toBe('* * * * *');
    }
  });
});
