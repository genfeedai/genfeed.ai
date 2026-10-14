import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostAccountGenerationService } from '@api/collections/posts/services/post-account-generation.service';
import type { AccountGenerationRun } from '@api/collections/posts/services/post-account-generation.types';
import { PostAccountGenerationBillingService } from '@api/collections/posts/services/post-account-generation-billing.service';
import type { AccountGenerationJobData } from '@api/collections/posts/services/post-account-generation-job.types';
import { PostAccountGenerationQueueService } from '@api/collections/posts/services/post-account-generation-queue.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class PostAccountGenerationRunnerService {
  constructor(
    private readonly generation: PostAccountGenerationService,
    private readonly queue: PostAccountGenerationQueueService,
    private readonly billing: PostAccountGenerationBillingService,
    private readonly accounts: AccountPublishingContextService,
    private readonly posts: PostsService,
    private readonly logger: LoggerService,
    private readonly notifications: NotificationsPublisherService,
  ) {}

  async process(data: AccountGenerationJobData): Promise<void> {
    let pending = data;
    try {
      await this.queue.renew(data.run.scope.organizationId, data.run.runId);
      const context = await this.accounts.resolve({
        brandId: data.run.identity.brandId,
        credentialId: data.dto.credentialId,
        organizationId: data.run.identity.organizationId,
        sourceLineage: {
          sourceReferenceIds: data.dto.sourceReferenceIds,
          sourceUrl: data.dto.sourceUrl,
          trendId: data.dto.trendId,
        },
        surface: data.dto.format === 'thread' ? 'thread' : 'post',
      });
      const run: AccountGenerationRun = {
        ...data.run,
        context,
        funding: {
          ...data.run.funding,
          apiKey: await this.billing.queuedApiKey(
            data.run.model,
            data.run.scope,
            data.run.isByok,
          ),
        },
      };
      const page: PostDocument[] = [];
      for (const id of data.postIds) {
        const post = await this.posts.findOne(
          {
            id,
            groupId: run.runId,
            brandId: run.identity.brandId,
            organizationId: run.scope.organizationId,
            isDeleted: false,
          },
          'none',
        );
        if (!post)
          throw new ConflictException(
            'account_generation_placeholder_unavailable',
          );
        page.push(post);
      }
      const nextOffset = data.offset + page.length;
      const isLastPage = nextOffset >= data.dto.count;
      const written = await this.generation.execute(data.dto, run, page, {
        isLastPage,
        previousTexts: data.previousTexts,
      });
      if (written && !isLastPage) {
        await this.queue.renew(run.scope.organizationId, run.runId);
        const nextPage = await this.generation.createPlaceholders(
          data.dto,
          run,
          nextOffset,
        );
        pending = {
          ...data,
          offset: nextOffset,
          postIds: nextPage.map((post) => String(post.id)),
          previousTexts: written,
        };
        await this.queue.enqueue(pending);
      } else {
        await this.queue.release(run.scope.organizationId, run.runId);
      }
    } catch (error) {
      await this.fail(pending);
      throw error;
    } finally {
      await this.notifications
        .emit(WebSocketPaths.brand(data.run.scope.brandId), {
          event: 'account-generation-progress',
          runId: data.run.runId,
        })
        .catch((error: unknown) =>
          this.logger.warn('Account generation progress notification failed', {
            error,
            runId: data.run.runId,
          }),
        );
    }
  }

  async fail(data: AccountGenerationJobData): Promise<void> {
    const released = await Promise.allSettled([
      ...data.postIds.map((id) =>
        this.posts.patchOneWhere(
          {
            id,
            groupId: data.run.runId,
            brandId: data.run.identity.brandId,
            organizationId: data.run.scope.organizationId,
            isDeleted: false,
            targetExecutionState: TargetExecutionState.PUBLISHING,
          },
          {
            targetExecutionState: TargetExecutionState.FAILED,
            targetError: {
              code: 'account_generation_worker_failed',
              isRetryable: true,
              message: 'This generation stopped. Retry the failed post.',
            },
          },
          [],
        ),
      ),
      this.billing.releaseRun(
        { ...data.run.funding, apiKey: undefined },
        data.run.scope,
      ),
      this.queue.release(data.run.scope.organizationId, data.run.runId),
    ]);
    for (const result of released)
      if (result.status === 'rejected')
        this.logger.error('Account generation cleanup failed', result.reason, {
          runId: data.run.runId,
        });
  }
}
