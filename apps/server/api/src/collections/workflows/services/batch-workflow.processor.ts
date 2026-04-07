import {
  BatchWorkflowItemCompletionInput,
  BatchWorkflowService,
} from '@api/collections/workflows/services/batch-workflow.service';
import {
  BATCH_WORKFLOW_QUEUE,
  BatchWorkflowItemJobData,
} from '@api/collections/workflows/services/batch-workflow-queue.service';
import type {
  NodeExecutionSummary,
  WorkflowExecutionResult,
} from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor(BATCH_WORKFLOW_QUEUE, {
  concurrency: 2,
  limiter: { duration: 60000, max: 10 },
})
export class BatchWorkflowProcessor extends WorkerHost {
  private readonly logContext = 'BatchWorkflowProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly batchService: BatchWorkflowService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => WorkflowExecutorService))
    private readonly workflowExecutor: WorkflowExecutorService,
  ) {
    super();
  }

  async process(job: Job<BatchWorkflowItemJobData>): Promise<void> {
    const { data } = job;
    const {
      batchJobId,
      itemId,
      workflowId,
      ingredientId,
      userId,
      organizationId,
    } = data;

    this.logger.log(`${this.logContext} processing batch item`, {
      batchJobId,
      ingredientId,
      itemId,
      workflowId,
    });

    try {
      // Mark item as processing
      await this.batchService.markItemProcessing(batchJobId, itemId);

      // Execute the workflow for this ingredient
      const result = await this.workflowExecutor.executeManualWorkflow(
        workflowId,
        userId,
        organizationId,
        { ingredientId },
      );

      // Mark item as completed
      await this.batchService.markItemCompleted(
        batchJobId,
        itemId,
        this.buildCompletionInput(result),
      );

      this.logger.log(`${this.logContext} batch item completed`, {
        batchJobId,
        executionId: result.executionId,
        itemId,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`${this.logContext} batch item failed`, {
        batchJobId,
        error: errorMessage,
        itemId,
      });

      await this.batchService.markItemFailed(batchJobId, itemId, errorMessage);

      // Don't rethrow — we handle failures per-item, not per-batch
    }
  }

  private buildCompletionInput(
    result: WorkflowExecutionResult,
  ): BatchWorkflowItemCompletionInput {
    const completion: BatchWorkflowItemCompletionInput = {
      executionId: result.executionId,
    };
    const outputSummary = this.resolveOutputSummary(result.nodeResults);

    if (!outputSummary) {
      return completion;
    }

    return {
      ...completion,
      outputCategory: outputSummary.category,
      outputIngredientId: outputSummary.id,
      outputSummary,
    };
  }

  private resolveOutputSummary(
    nodeResults: NodeExecutionSummary[],
  ): BatchWorkflowItemCompletionInput['outputSummary'] {
    for (const nodeResult of [...nodeResults].reverse()) {
      const summary = this.extractOutputSummary(nodeResult);

      if (summary) {
        return summary;
      }
    }

    return undefined;
  }

  private extractOutputSummary(
    nodeResult: NodeExecutionSummary,
  ): BatchWorkflowItemCompletionInput['outputSummary'] {
    if (!nodeResult.output) {
      return undefined;
    }

    const status =
      typeof nodeResult.output.status === 'string'
        ? nodeResult.output.status
        : undefined;

    const directSummary = this.extractSummaryFromRecord(
      nodeResult.output,
      status,
    );
    if (directSummary) {
      return directSummary;
    }

    for (const key of ['video', 'image', 'music', 'audio']) {
      const nestedValue = nodeResult.output[key];
      if (!nestedValue || typeof nestedValue !== 'object') {
        continue;
      }

      const nestedSummary = this.extractSummaryFromRecord(
        nestedValue as Record<string, unknown>,
        status,
      );

      if (nestedSummary) {
        return nestedSummary;
      }
    }

    return undefined;
  }

  private extractSummaryFromRecord(
    value: Record<string, unknown>,
    fallbackStatus?: string,
  ): BatchWorkflowItemCompletionInput['outputSummary'] {
    const category = this.inferOutputCategory(value);

    if (!category) {
      return undefined;
    }

    const id = this.extractOutputIngredientId(value, category);
    if (!id) {
      return undefined;
    }

    const ingredientUrl = this.buildIngredientUrl(category, id);
    const thumbnailUrl = this.buildThumbnailUrl(category, id);

    return {
      category,
      id,
      ingredientUrl,
      status: typeof value.status === 'string' ? value.status : fallbackStatus,
      thumbnailUrl,
    };
  }

  private inferOutputCategory(
    value: Record<string, unknown>,
  ): 'image' | 'video' | 'music' | undefined {
    if (
      typeof value.videoUrl === 'string' ||
      (value.video && typeof value.video === 'object')
    ) {
      return 'video';
    }

    if (
      typeof value.imageUrl === 'string' ||
      (value.image && typeof value.image === 'object')
    ) {
      return 'image';
    }

    if (
      typeof value.musicUrl === 'string' ||
      typeof value.audioUrl === 'string' ||
      typeof value.musicIngredientId === 'string' ||
      (value.music && typeof value.music === 'object') ||
      (value.audio && typeof value.audio === 'object')
    ) {
      return 'music';
    }

    return undefined;
  }

  private extractOutputIngredientId(
    value: Record<string, unknown>,
    category: 'image' | 'video' | 'music',
  ): string | undefined {
    if (category === 'music' && typeof value.musicIngredientId === 'string') {
      return value.musicIngredientId;
    }

    if (typeof value.id === 'string') {
      return value.id;
    }

    const nestedKeys = category === 'music' ? ['music', 'audio'] : [category];

    for (const key of nestedKeys) {
      const nestedValue = value[key];
      if (!nestedValue || typeof nestedValue !== 'object') {
        continue;
      }

      const nestedId = (nestedValue as Record<string, unknown>).id;
      if (typeof nestedId === 'string') {
        return nestedId;
      }
    }

    return undefined;
  }

  private buildIngredientUrl(
    category: 'image' | 'video' | 'music',
    ingredientId: string,
  ): string {
    switch (category) {
      case 'video':
        return `${this.configService.ingredientsEndpoint}/videos/${ingredientId}`;
      case 'music':
        return `${this.configService.ingredientsEndpoint}/musics/${ingredientId}`;
      default:
        return `${this.configService.ingredientsEndpoint}/images/${ingredientId}`;
    }
  }

  private buildThumbnailUrl(
    category: 'image' | 'video' | 'music',
    ingredientId: string,
  ): string | undefined {
    if (category === 'video') {
      return `${this.configService.ingredientsEndpoint}/thumbnails/${ingredientId}`;
    }

    if (category === 'image') {
      return this.buildIngredientUrl(category, ingredientId);
    }

    return undefined;
  }
}
