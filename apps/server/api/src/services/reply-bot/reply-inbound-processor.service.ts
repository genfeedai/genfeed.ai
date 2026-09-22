import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { AuthorReplyLoopService } from '@api/services/reply-bot/author-reply-loop.service';
import {
  buildReplyInboundWorkflowDefinition,
  REPLY_INGESTION_ACTION_IDS,
  type ReplyInboundWorkflowInput,
  type ReplyInboundWorkflowResult,
} from '@api/services/reply-bot/reply-ingestion-workflow-definition';
import { ReplyIntentClassifierService } from '@api/services/reply-bot/reply-intent-classifier.service';
import {
  BotActivitySkipReason,
  BotActivityStatus,
  ReplyBotPlatform,
  ReplyBotType,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import type { IReplyIntentClassification } from '@genfeedai/contracts/interfaces';
import { Injectable, type OnModuleInit } from '@nestjs/common';

type InboundPreparation = {
  input: ReplyInboundWorkflowInput;
  items: Array<Record<string, unknown>>;
  outcome?: ReplyInboundWorkflowResult;
};

@Injectable()
export class ReplyInboundProcessorService implements OnModuleInit {
  constructor(
    private readonly processedTweetsService: ProcessedTweetsService,
    private readonly botActivitiesService: BotActivitiesService,
    private readonly authorReplyLoopService: AuthorReplyLoopService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly replyIntentClassifierService: ReplyIntentClassifierService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerWorkflow(buildReplyInboundWorkflowDefinition());
    this.workflowRunner.registerAction(
      REPLY_INGESTION_ACTION_IDS.PREPARE_INBOUND,
      (request) => this.prepareAction(request),
    );
    this.workflowRunner.registerAction(
      REPLY_INGESTION_ACTION_IDS.FINALIZE_INBOUND,
      (request) => this.finalizeAction(request),
    );
  }

  async enqueue(data: ReplyInboundWorkflowInput): Promise<{ jobId: string }> {
    const definition = buildReplyInboundWorkflowDefinition();
    const jobId = await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request: data },
        metadata: { commentId: data.commentId },
        organizationId: data.organizationId,
        source: `reply-inbound-${data.source}`,
        trigger: WorkflowExecutionTrigger.EVENT,
      },
      `reply-inbound-${data.organizationId}-${data.commentId}`,
      { replaceTerminalJob: true },
    );
    return { jobId };
  }

  async process(
    data: ReplyInboundWorkflowInput,
  ): Promise<ReplyInboundWorkflowResult> {
    const definition = buildReplyInboundWorkflowDefinition();
    const { result } =
      await this.workflowRunner.runWorkflow<ReplyInboundWorkflowResult>({
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request: data },
        organizationId: data.organizationId,
        source: 'ReplyInboundProcessorService.process',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
      });
    return result;
  }

  private async prepareAction(
    action: SystemWorkflowActionRequest,
  ): Promise<InboundPreparation> {
    const input = this.readInput(action.input.request);
    const baseResult = {
      commentId: input.commentId,
      organizationId: input.organizationId,
    };
    const already = await this.processedTweetsService.isProcessed(
      input.commentId,
      input.organizationId,
      ReplyBotType.COMMENT_RESPONDER,
    );
    if (already) {
      return {
        input,
        items: [],
        outcome: { ...baseResult, skipped: true, success: true },
      };
    }
    // A comment already queued for a person is not decided again. This job
    // is keyed per comment and replaces its own terminal run, so a redelivered
    // webhook would otherwise spend another decision and, on a confident
    // answer, auto-reply to something a human was asked to handle (#4866).
    const hold = await this.botActivitiesService.findIntentReviewHold(
      input.organizationId,
      input.commentId,
    );
    if (hold) {
      return {
        input,
        items: [],
        outcome: { ...baseResult, skipped: true, success: true },
      };
    }

    const platform = this.resolvePlatform(input);
    const classification = await this.replyIntentClassifierService.classify({
      authorHandle: input.commentAuthorUsername,
      ...(input.brandId === undefined ? {} : { brandId: input.brandId }),
      commentText: input.commentText,
      organizationId: input.organizationId,
      ...(input.parentPostPreview === undefined
        ? {}
        : { postCaption: input.parentPostPreview }),
    });
    const { intent } = classification;

    // Uncertain: no auto-reply, and deliberately no markAsProcessed either —
    // a processed comment drops out of the author inbox, and queueing it for
    // a person is the whole point of the confidence gate (#4866). The hold
    // record is what keeps the next delivery from deciding it again.
    if (classification.isNeedsReview) {
      await this.recordIntentReviewHold(input, platform, classification);
      return {
        input,
        items: [],
        outcome: { ...baseResult, skipped: true, success: true },
      };
    }

    if (classification.isAutoSkip) {
      await this.processedTweetsService.markAsProcessed(
        input.commentId,
        input.organizationId,
        ReplyBotType.COMMENT_RESPONDER,
      );
      return {
        input,
        items: [],
        outcome: { ...baseResult, skipped: true, success: true },
      };
    }
    if (!input.brandId) {
      return {
        input,
        items: [],
        outcome: {
          ...baseResult,
          error: 'brandId required for auto-send',
          skipped: true,
          success: false,
        },
      };
    }
    const userId = await this.authorReplyLoopService.findResponderOwnerUserId(
      input.organizationId,
      input.brandId,
      platform,
    );
    if (!userId) {
      return {
        input,
        items: [],
        outcome: {
          ...baseResult,
          error:
            'no reply bot owner — enable auto-replies for this brand first',
          skipped: true,
          success: false,
        },
      };
    }
    return {
      input,
      items: [
        {
          brandId: input.brandId,
          commentAuthor: input.commentAuthorUsername,
          ...(input.commentAuthorId === undefined
            ? {}
            : { commentAuthorId: input.commentAuthorId }),
          commentId: input.commentId,
          commentText: input.commentText,
          intent,
          ...(classification.confidence === undefined
            ? {}
            : { intentConfidence: classification.confidence }),
          intentSource: classification.source,
          organizationId: input.organizationId,
          parentPostId: input.parentPostId,
          ...(input.parentPostPreview === undefined
            ? {}
            : { parentPostPreview: input.parentPostPreview }),
          platform,
          userId,
        },
      ],
    };
  }

  private async finalizeAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ReplyInboundWorkflowResult> {
    const state = this.readRecord(action.input.state) as InboundPreparation;
    if (state.outcome) return state.outcome;
    const input = this.readInput(state.input);
    const batch = this.readRecord(action.input.batch);
    const results = Array.isArray(batch.results) ? batch.results : [];
    const first = this.readRecord(results[0]);
    const result = this.readRecord(first.result);
    const error = typeof result.error === 'string' ? result.error : undefined;
    return {
      commentId: input.commentId,
      ...(error === undefined ? {} : { error }),
      organizationId: input.organizationId,
      skipped: false,
      success: result.success === true,
    };
  }

  private resolvePlatform(input: ReplyInboundWorkflowInput): ReplyBotPlatform {
    return input.platform === 'youtube'
      ? ReplyBotPlatform.YOUTUBE
      : ReplyBotPlatform.TWITTER;
  }

  /**
   * The same skipped activity the orchestrator path writes for an uncertain
   * comment, so the hold is one record whichever path found the comment.
   * Without a brand or a responder owner nothing could auto-send it anyway,
   * and an activity row needs an owner — so there is nothing to hold.
   */
  private async recordIntentReviewHold(
    input: ReplyInboundWorkflowInput,
    platform: ReplyBotPlatform,
    classification: IReplyIntentClassification,
  ): Promise<void> {
    if (!input.brandId) return;
    const userId = await this.authorReplyLoopService.findResponderOwnerUserId(
      input.organizationId,
      input.brandId,
      platform,
    );
    if (!userId) return;
    await this.botActivitiesService.create({
      botType: ReplyBotType.COMMENT_RESPONDER,
      brandId: input.brandId,
      completedAt: new Date(),
      errorMessage:
        'Intent confidence below threshold — queued for human review',
      intent: classification.intent,
      ...(classification.confidence === undefined
        ? {}
        : { intentConfidence: classification.confidence }),
      intentSource: classification.source,
      isIntentNeedsReview: true,
      organizationId: input.organizationId,
      skipReason: BotActivitySkipReason.NEEDS_REVIEW,
      status: BotActivityStatus.SKIPPED,
      ...(input.commentAuthorId === undefined
        ? {}
        : { triggerTweetAuthorId: input.commentAuthorId }),
      triggerTweetAuthorUsername: input.commentAuthorUsername,
      triggerTweetId: input.commentId,
      triggerTweetText: input.commentText,
      userId,
    });
  }

  private readInput(value: unknown): ReplyInboundWorkflowInput {
    const input = this.readRecord(value);
    return input as unknown as ReplyInboundWorkflowInput;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
