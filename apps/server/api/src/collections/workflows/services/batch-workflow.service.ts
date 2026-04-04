import {
  BatchWorkflowItem,
  type BatchWorkflowItemOutputSummary,
  BatchWorkflowItemStatus,
  BatchWorkflowJob,
  type BatchWorkflowJobDocument,
  BatchWorkflowJobStatus,
} from '@api/collections/workflows/schemas/batch-workflow-job.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateBatchJobInput {
  workflowId: string;
  ingredientIds: string[];
  userId: string;
  organizationId: string;
}

export interface BatchWorkflowItemCompletionInput {
  executionId?: string;
  outputIngredientId?: string;
  outputCategory?: string;
  outputSummary?: BatchWorkflowItemOutputSummary;
}

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class BatchWorkflowService {
  private readonly logContext = 'BatchWorkflowService';

  constructor(
    @InjectModel(BatchWorkflowJob.name, DB_CONNECTIONS.CLOUD)
    private readonly batchJobModel: Model<BatchWorkflowJobDocument>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Create a new batch workflow job with items for each ingredient.
   */
  async createBatchJob(
    input: CreateBatchJobInput,
  ): Promise<BatchWorkflowJobDocument> {
    const { workflowId, ingredientIds, userId, organizationId } = input;

    if (!ingredientIds.length) {
      throw new BadRequestException('At least one ingredientId is required');
    }

    if (ingredientIds.length > 100) {
      throw new BadRequestException('Maximum 100 items per batch');
    }

    const items: Partial<BatchWorkflowItem>[] = ingredientIds.map((id) => ({
      ingredientId: new Types.ObjectId(id),
      status: BatchWorkflowItemStatus.PENDING,
    }));

    const job = await this.batchJobModel.create({
      completedCount: 0,
      failedCount: 0,
      items,
      organization: new Types.ObjectId(organizationId),
      status: BatchWorkflowJobStatus.PENDING,
      totalCount: ingredientIds.length,
      user: new Types.ObjectId(userId),
      workflowId: new Types.ObjectId(workflowId),
    });

    this.logger.log(`${this.logContext} created batch job`, {
      batchJobId: job._id.toString(),
      itemCount: ingredientIds.length,
      workflowId,
    });

    return job;
  }

  /**
   * Get a batch job by ID.
   */
  async getBatchJob(batchJobId: string): Promise<BatchWorkflowJobDocument> {
    const job = await this.batchJobModel.findById(batchJobId).exec();
    if (!job) {
      throw new NotFoundException(`Batch job ${batchJobId} not found`);
    }
    return job;
  }

  /**
   * Get a batch job by ID, scoped to organization.
   */
  async getBatchJobForOrg(
    batchJobId: string,
    organizationId: string,
  ): Promise<BatchWorkflowJobDocument> {
    const job = await this.batchJobModel
      .findOne({
        _id: new Types.ObjectId(batchJobId),
        organization: new Types.ObjectId(organizationId),
      })
      .exec();

    if (!job) {
      throw new NotFoundException(`Batch job ${batchJobId} not found`);
    }
    return job;
  }

  /**
   * List batch jobs for an organization.
   */
  async listBatchJobs(
    organizationId: string,
    limit = 20,
    offset = 0,
  ): Promise<BatchWorkflowJobDocument[]> {
    return this.batchJobModel
      .find({ organization: new Types.ObjectId(organizationId) })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
  }

  /**
   * Mark the batch job as processing.
   */
  async markProcessing(batchJobId: string): Promise<void> {
    await this.batchJobModel.updateOne(
      { _id: new Types.ObjectId(batchJobId) },
      { $set: { status: BatchWorkflowJobStatus.PROCESSING } },
    );
  }

  /**
   * Mark an individual item as processing.
   */
  async markItemProcessing(batchJobId: string, itemId: string): Promise<void> {
    await this.batchJobModel.updateOne(
      {
        _id: new Types.ObjectId(batchJobId),
        'items._id': new Types.ObjectId(itemId),
      },
      {
        $set: {
          'items.$.startedAt': new Date(),
          'items.$.status': BatchWorkflowItemStatus.PROCESSING,
        },
      },
    );
  }

  /**
   * Mark an individual item as completed.
   */
  async markItemCompleted(
    batchJobId: string,
    itemId: string,
    completion: BatchWorkflowItemCompletionInput = {},
  ): Promise<void> {
    const updateFields: Record<string, unknown> = {
      'items.$.completedAt': new Date(),
      'items.$.status': BatchWorkflowItemStatus.COMPLETED,
    };

    if (completion.executionId) {
      updateFields['items.$.executionId'] = completion.executionId;
    }
    if (completion.outputIngredientId) {
      updateFields['items.$.outputIngredientId'] = new Types.ObjectId(
        completion.outputIngredientId,
      );
    }
    if (completion.outputCategory) {
      updateFields['items.$.outputCategory'] = completion.outputCategory;
    }
    if (completion.outputSummary) {
      updateFields['items.$.outputSummary'] = completion.outputSummary;
    }

    await this.batchJobModel.updateOne(
      {
        _id: new Types.ObjectId(batchJobId),
        'items._id': new Types.ObjectId(itemId),
      },
      {
        $inc: { completedCount: 1 },
        $set: updateFields,
      },
    );

    await this.checkAndFinalizeJob(batchJobId);
  }

  /**
   * Mark an individual item as failed.
   */
  async markItemFailed(
    batchJobId: string,
    itemId: string,
    error: string,
  ): Promise<void> {
    await this.batchJobModel.updateOne(
      {
        _id: new Types.ObjectId(batchJobId),
        'items._id': new Types.ObjectId(itemId),
      },
      {
        $inc: { failedCount: 1 },
        $set: {
          'items.$.completedAt': new Date(),
          'items.$.error': error,
          'items.$.status': BatchWorkflowItemStatus.FAILED,
        },
      },
    );

    await this.checkAndFinalizeJob(batchJobId);
  }

  /**
   * Check if all items are done and finalize the job status.
   */
  private async checkAndFinalizeJob(batchJobId: string): Promise<void> {
    const job = await this.batchJobModel.findById(batchJobId).exec();
    if (!job) {
      return;
    }

    const processed = job.completedCount + job.failedCount;
    if (processed >= job.totalCount) {
      const finalStatus =
        job.failedCount > 0 && job.completedCount === 0
          ? BatchWorkflowJobStatus.FAILED
          : BatchWorkflowJobStatus.COMPLETED;

      await this.batchJobModel.updateOne(
        { _id: new Types.ObjectId(batchJobId) },
        { $set: { status: finalStatus } },
      );

      this.logger.log(`${this.logContext} batch job finalized`, {
        batchJobId,
        completedCount: job.completedCount,
        failedCount: job.failedCount,
        status: finalStatus,
      });
    }
  }
}
