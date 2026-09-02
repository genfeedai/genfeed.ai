import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class PostRetryService {
  constructor(private readonly postsService: PostsService) {}

  async retryPost(
    postId: string,
    organizationId: string,
  ): Promise<PostDocument> {
    const post = await this.postsService.findOne({
      id: postId,
      isDeleted: false,
    });

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

    return this.postsService.patch(postId, {
      retryCount: 0,
      scheduledDate,
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });
  }
}
