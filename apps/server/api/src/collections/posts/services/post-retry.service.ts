import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { TargetExecutionState } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class PostRetryService {
  constructor(private readonly postsService: PostsService) {}

  async retryPost(
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
