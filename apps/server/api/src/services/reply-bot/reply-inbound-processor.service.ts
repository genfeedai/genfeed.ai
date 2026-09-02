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
import {
  getReplyIntentPersona,
  resolveReplyIntent,
} from '@api/services/reply-bot/reply-intent.util';
import {
  ReplyBotPlatform,
  ReplyBotType,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
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
    private readonly authorReplyLoopService: AuthorReplyLoopService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
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

    const intent = resolveReplyIntent(input.commentText);
    if (getReplyIntentPersona(intent).shouldSkipAuto) {
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
    const platform =
      input.platform === 'youtube'
        ? ReplyBotPlatform.YOUTUBE
        : ReplyBotPlatform.TWITTER;
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
