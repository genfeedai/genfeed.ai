import { PostRetryService } from '@api/collections/posts/services/post-retry.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type { CacheService } from '@api/services/cache/cache.service';
import { PostStatus, TargetExecutionState } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { HttpStatus } from '@nestjs/common';

describe('PostRetryService', () => {
  const organizationId = testId('org');
  const postId = testId('post');
  const targetError = {
    code: 'PUBLISH_FAILED',
    failedAt: '2026-08-08T09:00:00.000Z',
    isRetryable: true,
    message: 'Provider request failed',
  };
  const failedPost = {
    id: postId,
    isDeleted: false,
    organizationId,
    retryCount: 3,
    scheduledDate: new Date(Date.now() - 60_000),
    status: PostStatus.FAILED,
    targetError,
    targetExecutionState: TargetExecutionState.FAILED,
  };
  const postsService = {
    findOne: vi.fn(),
    patch: vi.fn(),
    prisma: { post: { updateMany: vi.fn() } },
  };
  const claims = new Map<string, string>();
  const cacheService = {
    acquireOwnedClaim: vi.fn(async (key: string, token: string) => {
      if (claims.has(key)) {
        return 'duplicate' as const;
      }
      claims.set(key, token);
      return 'claimed' as const;
    }),
    releaseOwnedClaim: vi.fn(async (key: string, token: string) => {
      if (claims.get(key) !== token) {
        return false;
      }
      claims.delete(key);
      return true;
    }),
  };
  const service = new PostRetryService(
    postsService as unknown as PostsService,
    cacheService as unknown as CacheService,
  );

  afterEach(() => {
    vi.clearAllMocks();
    claims.clear();
  });

  it('re-arms and queues once when two retries overlap', async () => {
    const stored = { ...failedPost };
    let rearmWrites = 0;
    postsService.findOne.mockImplementation(async () => {
      const snapshot = { ...stored };
      await new Promise((resolve) => setImmediate(resolve));
      return snapshot;
    });
    postsService.patch.mockImplementation(async () => {
      await new Promise((resolve) => setImmediate(resolve));
      rearmWrites += 1;
      stored.targetExecutionState = TargetExecutionState.SCHEDULED;
      return { ...stored };
    });

    const results = await Promise.allSettled([
      service.retryPost(postId, organizationId),
      service.retryPost(postId, organizationId),
    ]);

    expect(rearmWrites).toBe(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: { status: HttpStatus.CONFLICT },
    });
    expect(claims.size).toBe(0);
  });

  it('releases the claim when the re-arm fails so the retry can be repeated', async () => {
    postsService.findOne.mockResolvedValue(failedPost);
    postsService.patch.mockRejectedValueOnce(new Error('write failed'));

    await expect(service.retryPost(postId, organizationId)).rejects.toThrow(
      'write failed',
    );
    expect(claims.size).toBe(0);
  });

  it('re-arms thread children that failed only because their parent did', async () => {
    postsService.findOne.mockResolvedValue(failedPost);
    postsService.patch.mockResolvedValue(failedPost);

    await service.retryPost(postId, organizationId);

    expect(postsService.prisma.post.updateMany).toHaveBeenCalledWith({
      data: {
        targetError: expect.anything(),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      },
      where: expect.objectContaining({
        isDeleted: false,
        organizationId,
        parentId: postId,
        targetError: { equals: 'parent_failed', path: ['code'] },
        targetExecutionState: TargetExecutionState.FAILED,
      }),
    });
  });

  it('re-arms a failed post with a current retry date', async () => {
    const updatedPost = {
      ...failedPost,
      retryCount: 0,
      scheduledDate: new Date(),
      status: PostStatus.SCHEDULED,
      targetExecutionState: TargetExecutionState.SCHEDULED,
    };
    postsService.findOne.mockResolvedValue(failedPost);
    postsService.patch.mockResolvedValue(updatedPost);

    const beforeRetry = Date.now();
    await expect(service.retryPost(postId, organizationId)).resolves.toBe(
      updatedPost,
    );
    const afterRetry = Date.now();

    expect(postsService.findOne).toHaveBeenCalledWith({
      id: postId,
      isDeleted: false,
      organizationId,
    });
    expect(postsService.patch).toHaveBeenCalledWith(
      postId,
      expect.objectContaining({
        retryCount: 0,
        scheduledDate: expect.any(Date),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    );
    const updatePayload = postsService.patch.mock.calls[0]?.[1];
    expect(updatePayload?.scheduledDate.getTime()).toBeGreaterThanOrEqual(
      beforeRetry,
    );
    expect(updatePayload?.scheduledDate.getTime()).toBeLessThanOrEqual(
      afterRetry,
    );
    expect(updatePayload).not.toHaveProperty('targetError');
  });

  it('retains a future scheduled date', async () => {
    const futureDate = new Date(Date.now() + 60_000);
    postsService.findOne.mockResolvedValue({
      ...failedPost,
      scheduledDate: futureDate,
    });
    postsService.patch.mockResolvedValue(failedPost);

    await service.retryPost(postId, organizationId);

    expect(postsService.patch).toHaveBeenCalledWith(postId, {
      retryCount: 0,
      scheduledDate: futureDate,
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });
  });

  it('uses the current time when the scheduled date is absent', async () => {
    postsService.findOne.mockResolvedValue({
      ...failedPost,
      scheduledDate: null,
    });
    postsService.patch.mockResolvedValue(failedPost);

    const beforeRetry = Date.now();
    await service.retryPost(postId, organizationId);
    const afterRetry = Date.now();
    const scheduledDate = postsService.patch.mock.calls[0]?.[1].scheduledDate;

    expect(scheduledDate.getTime()).toBeGreaterThanOrEqual(beforeRetry);
    expect(scheduledDate.getTime()).toBeLessThanOrEqual(afterRetry);
  });

  it('preserves the missing-post error response', async () => {
    postsService.findOne.mockResolvedValue(null);

    await expect(
      service.retryPost(postId, organizationId),
    ).rejects.toMatchObject({
      response: {
        detail: 'Post not found',
        title: `Post ${postId} not found`,
      },
      status: HttpStatus.NOT_FOUND,
    });
    expect(postsService.patch).not.toHaveBeenCalled();
  });

  it('preserves the foreign-organization error response', async () => {
    postsService.findOne.mockResolvedValue({
      ...failedPost,
      organizationId: testId('other'),
    });

    await expect(
      service.retryPost(postId, organizationId),
    ).rejects.toMatchObject({
      response: {
        detail: 'You do not have access to this post',
        title: 'Access denied',
      },
      status: HttpStatus.FORBIDDEN,
    });
    expect(postsService.patch).not.toHaveBeenCalled();
  });

  it('preserves the non-failed error response', async () => {
    postsService.findOne.mockResolvedValue({
      ...failedPost,
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });

    await expect(
      service.retryPost(postId, organizationId),
    ).rejects.toMatchObject({
      response: {
        detail: 'Only failed posts can be retried',
        title: 'Post is not failed',
      },
      status: HttpStatus.BAD_REQUEST,
    });
    expect(postsService.patch).not.toHaveBeenCalled();
  });
});
