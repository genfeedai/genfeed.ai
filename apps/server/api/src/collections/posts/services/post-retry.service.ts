import { randomUUID } from 'node:crypto';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { CacheService } from '@api/services/cache/cache.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { TargetExecutionState } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const POST_RETRY_CLAIM_TTL_SECONDS = 30;

@Traced()
@Injectable()
export class PostRetryService {
  constructor(
    private readonly postsService: PostsService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * The FAILED check and the re-arm write are separate statements, so two
   * overlapping retries both read FAILED and both re-arm and enqueue. One
   * claim per post lets a single retry through at a time; the loser gets a 409
   * and a later click re-reads the real state. A cache outage proceeds
   * unclaimed, as before.
   */
  async retryPost(
    postId: string,
    organizationId: string,
  ): Promise<PostDocument> {
    const claimKey = `post-retry:${organizationId}:${postId}`;
    const token = randomUUID();
    const claim = await this.cacheService.acquireOwnedClaim(
      claimKey,
      token,
      POST_RETRY_CLAIM_TTL_SECONDS,
    );
    if (claim === 'duplicate') {
      throw new HttpException(
        {
          detail: 'A retry for this post is already in progress',
          title: 'Retry in progress',
        },
        HttpStatus.CONFLICT,
      );
    }

    try {
      return await this.rearmFailedPost(postId, organizationId);
    } finally {
      if (claim === 'claimed') {
        await this.cacheService.releaseOwnedClaim(claimKey, token);
      }
    }
  }

  private async rearmFailedPost(
    postId: string,
    organizationId: string,
  ): Promise<PostDocument> {
    const post = await this.postsService.findOne(
      scopedWhere(organizationId, { id: postId }),
    );

    if (!post) {
      throw new HttpException(
        {
          detail: 'Post not found',
          title: `Post ${postId} not found`,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (post.organizationId !== organizationId) {
      throw new HttpException(
        {
          detail: 'You do not have access to this post',
          title: 'Access denied',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (
      (post.targetExecutionState ?? TargetExecutionState.DRAFT) !==
      TargetExecutionState.FAILED
    ) {
      throw new HttpException(
        {
          detail: 'Only failed posts can be retried',
          title: 'Post is not failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    const scheduledDate =
      post.scheduledDate && post.scheduledDate.getTime() > now.getTime()
        ? post.scheduledDate
        : now;

    const retried = await this.postsService.patch(postId, {
      retryCount: 0,
      scheduledDate,
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });
    await this.rearmChildrenFailedWithParent(postId, organizationId);
    return retried;
  }

  /**
   * A parent that fails also fails its thread children (`parent_failed`), and
   * only SCHEDULED children are delivered after the parent publishes. Retrying
   * the parent alone left the reply FAILED, so the thread posted without it.
   * Children that failed on their own keep their own error.
   */
  private async rearmChildrenFailedWithParent(
    parentId: string,
    organizationId: string,
  ): Promise<void> {
    await this.postsService.prisma.post.updateMany({
      data: {
        targetError: Prisma.JsonNull,
        targetExecutionState: TargetExecutionState.SCHEDULED,
      },
      where: scopedWhere(organizationId, {
        isDeleted: false,
        parentId,
        targetError: { equals: 'parent_failed', path: ['code'] },
        targetExecutionState: TargetExecutionState.FAILED,
      }),
    });
  }
}
