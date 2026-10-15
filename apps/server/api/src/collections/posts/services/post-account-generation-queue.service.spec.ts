import type { AccountGenerationJobData } from '@api/collections/posts/services/post-account-generation-job.types';
import { PostAccountGenerationQueueService } from '@api/collections/posts/services/post-account-generation-queue.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PostAccountGenerationQueueService', () => {
  const redis = { defineCommand: vi.fn(), runCommand: vi.fn(), llen: vi.fn() };
  const queue = {
    add: vi.fn(),
    keys: { paused: 'bull:account-generation:paused' },
    getJobCounts: vi.fn(),
    getBackend: () => ({ client: Promise.resolve(redis) }),
  };
  const service = new PostAccountGenerationQueueService(queue as never);
  const page = (): AccountGenerationJobData => ({
    dto: {
      count: 13,
      credentialId: 'account-1',
      format: 'post',
      topic: 'Topic',
    },
    offset: 0,
    postIds: ['post-1'],
    previousTexts: [],
    run: { runId: 'run-1', scope: { organizationId: 'org-1' } } as never,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    redis.runCommand.mockResolvedValue(1);
    redis.llen.mockResolvedValue(0);
    queue.add.mockResolvedValue(undefined);
    queue.getJobCounts.mockResolvedValue({
      waiting: 0,
      active: 0,
      paused: 0,
      delayed: 0,
    });
  });

  it('returns 429 when another run owns the organization', async () => {
    redis.runCommand.mockResolvedValue(0);
    await expect(service.claim('org-1', 'run-1')).rejects.toMatchObject({
      status: 429,
      response: { code: 'account_generation_already_active' },
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns 429 when the shared backlog is full', async () => {
    redis.runCommand.mockResolvedValue(-1);
    await expect(service.claim('org-1', 'run-1')).rejects.toMatchObject({
      status: 429,
      response: { code: 'account_generation_queue_full' },
    });
  });

  it('fails admission when Redis is unavailable', async () => {
    redis.runCommand.mockRejectedValue(new Error('Redis unavailable'));
    await expect(service.claim('org-1', 'run-1')).rejects.toThrow(
      'Redis unavailable',
    );
  });

  it('rejects an expired-lease backlog that is still waiting for workers', async () => {
    queue.getJobCounts.mockResolvedValue({
      waiting: 1000,
      active: 0,
      paused: 0,
      delayed: 0,
    });
    await expect(service.claim('org-1', 'run-1')).rejects.toMatchObject({
      status: 429,
      response: { code: 'account_generation_queue_full' },
    });
    expect(redis.runCommand).not.toHaveBeenCalled();
  });

  it('rejects new runs when the backlog is paused', async () => {
    redis.llen.mockResolvedValue(1000);
    await expect(service.claim('org-1', 'run-1')).rejects.toMatchObject({
      status: 429,
    });
    expect(redis.runCommand).not.toHaveBeenCalled();
  });

  it('refuses to continue a page after its ownership lease expired', async () => {
    redis.runCommand.mockResolvedValue(0);
    await expect(service.renew('org-1', 'run-1')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('binds ownership operations to the organization and run token', async () => {
    await service.claim('org-1', 'old-run');
    await service.release('org-1', 'old-run');
    expect(redis.runCommand.mock.calls[1]).toEqual([
      'accountGenerationRelease',
      [
        '{account-generation}:organization:org-1',
        '{account-generation}:pending',
        'old-run',
      ],
    ]);
    expect(redis.defineCommand.mock.calls[1][1].lua).toContain(
      "redis.call('GET', KEYS[1]) ~= ARGV[1]",
    );
  });

  it('never automatically retries a provider page and retains only bounded job history', async () => {
    await service.enqueue(page());
    expect(queue.add).toHaveBeenCalledWith(
      'generate-account-page',
      expect.anything(),
      {
        attempts: 1,
        jobId: 'account-generation-run-1-0',
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  });

  it.each(['empty', 'posts', 'history', 'offset', 'count'])(
    'rejects malformed or oversized %s pages',
    async (kind) => {
      const data = page();
      if (kind === 'empty') data.postIds = [];
      if (kind === 'posts') data.postIds = Array(11).fill('post');
      if (kind === 'history') data.previousTexts = Array(11).fill('text');
      if (kind === 'offset') data.offset = 13;
      if (kind === 'count')
        data.dto = { ...data.dto, count: Number.MAX_SAFE_INTEGER + 1 };
      await expect(service.enqueue(data)).rejects.toMatchObject({
        status: 409,
      });
      expect(queue.add).not.toHaveBeenCalled();
    },
  );
});
