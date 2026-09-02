import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import {
  buildReplyPostWatchWorkflowDefinition,
  REPLY_INGESTION_ACTION_IDS,
  type ReplyInboundWorkflowInput,
  type ReplyPostWatchWorkflowInput,
  type ReplyPostWatchWorkflowResult,
} from '@api/services/reply-bot/reply-ingestion-workflow-definition';
import {
  REPLY_POST_WATCH_DELAYS_MINUTES,
  REPLY_POST_WATCH_MAX_ATTEMPTS,
} from '@api/services/reply-bot/reply-post-watch.constants';
import { SocialMonitorService } from '@api/services/reply-bot/social-monitor.service';
import {
  Platform,
  ReplyBotPlatform,
  ReplyBotType,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { Injectable, type OnModuleInit } from '@nestjs/common';

type WatchFetchResult = ReplyPostWatchWorkflowInput & {
  commentsFound: number;
  items: ReplyInboundWorkflowInput[];
};

@Injectable()
export class ReplyPostWatchService implements OnModuleInit {
  constructor(
    private readonly socialMonitorService: SocialMonitorService,
    private readonly processedTweetsService: ProcessedTweetsService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerWorkflow(
      buildReplyPostWatchWorkflowDefinition(),
    );
    this.workflowRunner.registerAction(
      REPLY_INGESTION_ACTION_IDS.FETCH_POST_WATCH,
      (request) => this.fetchAction(request),
    );
    this.workflowRunner.registerAction(
      REPLY_INGESTION_ACTION_IDS.FINALIZE_POST_WATCH,
      (request) => this.finalizeAction(request),
    );
  }

  async schedulePostWatch(params: {
    brandId: string;
    organizationId: string;
    platform?: Platform.TWITTER | Platform.YOUTUBE | 'twitter' | 'youtube';
    postId: string;
    postPreview?: string;
  }): Promise<{ scheduled: number }> {
    const platform =
      String(params.platform) === 'youtube'
        ? Platform.YOUTUBE
        : Platform.TWITTER;
    const definition = buildReplyPostWatchWorkflowDefinition();
    const jobs = await Promise.all(
      REPLY_POST_WATCH_DELAYS_MINUTES.map((delayMinutes, attempt) => {
        const request: ReplyPostWatchWorkflowInput = {
          attempt,
          brandId: params.brandId,
          maxAttempts: REPLY_POST_WATCH_MAX_ATTEMPTS,
          organizationId: params.organizationId,
          platform,
          postId: params.postId,
          ...(params.postPreview === undefined
            ? {}
            : { postPreview: params.postPreview }),
        };
        return this.workflowQueue.queueSystemWorkflow(
          {
            actionType: definition.canonicalId,
            canonicalId: definition.canonicalId,
            inputValues: { request },
            metadata: { attempt, postId: params.postId },
            organizationId: params.organizationId,
            source: 'reply-post-watch-series',
            trigger: WorkflowExecutionTrigger.SCHEDULED,
          },
          `reply-post-watch-${params.organizationId}-${platform}-${params.postId}-${attempt}`,
          {
            delayMs: delayMinutes * 60 * 1000,
            replaceTerminalJob: true,
          },
        );
      }),
    );
    return { scheduled: jobs.length };
  }

  async runWatchAttempt(
    data: ReplyPostWatchWorkflowInput,
  ): Promise<ReplyPostWatchWorkflowResult> {
    const definition = buildReplyPostWatchWorkflowDefinition();
    const request: ReplyPostWatchWorkflowInput = {
      attempt: data.attempt,
      brandId: data.brandId,
      maxAttempts: data.maxAttempts,
      organizationId: data.organizationId,
      platform: data.platform,
      postId: data.postId,
      ...(data.postPreview === undefined
        ? {}
        : { postPreview: data.postPreview }),
    };
    const { result } =
      await this.workflowRunner.runWorkflow<ReplyPostWatchWorkflowResult>({
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: data.organizationId,
        source: 'ReplyPostWatchService.runWatchAttempt',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
      });
    return result;
  }

  private async fetchAction(
    action: SystemWorkflowActionRequest,
  ): Promise<WatchFetchResult> {
    const request = this.readInput(action.input.request);
    const watchPlatform =
      request.platform === Platform.YOUTUBE
        ? ReplyBotPlatform.YOUTUBE
        : ReplyBotPlatform.TWITTER;
    const wirePlatform =
      watchPlatform === ReplyBotPlatform.YOUTUBE
        ? Platform.YOUTUBE
        : Platform.TWITTER;
    const comments = await this.socialMonitorService.getContentComments(
      watchPlatform,
      request.postId,
      {
        brandId: request.brandId,
        limit: 40,
        organizationId: request.organizationId,
        preferOfficialApi: true,
      },
    );
    const items: ReplyInboundWorkflowInput[] = [];
    for (const comment of comments) {
      const already = await this.processedTweetsService.isProcessed(
        comment.id,
        request.organizationId,
        ReplyBotType.COMMENT_RESPONDER,
      );
      if (!already) {
        items.push({
          brandId: request.brandId,
          ...(comment.authorId === undefined
            ? {}
            : { commentAuthorId: comment.authorId }),
          commentAuthorUsername: comment.authorUsername,
          commentId: comment.id,
          commentText: comment.text,
          organizationId: request.organizationId,
          parentPostId: request.postId,
          ...(request.postPreview === undefined
            ? {}
            : { parentPostPreview: request.postPreview }),
          platform: wirePlatform,
          receivedAt: new Date().toISOString(),
          source: 'post-watch',
        });
      }
    }
    return { ...request, commentsFound: comments.length, items };
  }

  private async finalizeAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ReplyPostWatchWorkflowResult> {
    const state = this.readRecord(
      action.input.state,
    ) as unknown as WatchFetchResult;
    const batch = this.readRecord(action.input.batch);
    return {
      attempt: state.attempt,
      commentsFound: state.commentsFound,
      enqueued: typeof batch.count === 'number' ? batch.count : 0,
      organizationId: state.organizationId,
      postId: state.postId,
    };
  }

  private readInput(value: unknown): ReplyPostWatchWorkflowInput {
    return this.readRecord(value) as unknown as ReplyPostWatchWorkflowInput;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
