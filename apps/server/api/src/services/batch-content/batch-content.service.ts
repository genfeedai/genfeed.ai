import { randomUUID } from 'node:crypto';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  BATCH_CONTENT_ACTION_IDS,
  buildBatchContentWorkflowDefinitions,
  getBatchContentWorkflowId,
} from '@api/services/batch-content/batch-content-workflow-definition';
import type {
  BatchContentRequest,
  BatchContentResult,
  QueuedBatchContentResult,
} from '@api/services/batch-content/interfaces/batch-content.interfaces';
import type { GeneratedContent } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { isExecutableSkillSlug } from '@api/services/skill-executor/skill-workflow-definition';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ForbiddenException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

type BatchContentItem = BatchContentRequest & { itemIndex: number };

type ForEachResult = {
  count: number;
  results: Array<{ index: number; result: GeneratedContent }>;
};

@Injectable()
export class BatchContentService implements OnModuleInit {
  private readonly context = 'BatchContentService';

  constructor(
    private readonly brandsService: BrandsService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      BATCH_CONTENT_ACTION_IDS.PLAN,
      async (request) => this.planBatchAction(request),
    );
    this.workflowRunner.registerAction(
      BATCH_CONTENT_ACTION_IDS.PREPARE_ITEM,
      (request) => this.prepareItemAction(request),
    );
    this.workflowRunner.registerAction(
      BATCH_CONTENT_ACTION_IDS.RANK,
      async (request) => this.rankDraftsAction(request),
    );
    for (const definition of buildBatchContentWorkflowDefinitions()) {
      this.workflowRunner.registerWorkflow(definition);
    }
  }

  async queueBatch(
    request: BatchContentRequest,
    userId?: string,
  ): Promise<QueuedBatchContentResult> {
    await this.validateBrandOwnership(request.organizationId, request.brandId);
    if (!isExecutableSkillSlug(request.skillSlug)) {
      throw new NotFoundException(`Skill not found: ${request.skillSlug}`);
    }
    const canonicalId = getBatchContentWorkflowId(request.skillSlug);
    const jobId = await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: canonicalId,
        canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        source: 'BatchContentService.queueBatch',
        userId,
      },
      `batch-content-${randomUUID()}`,
      { attempts: 1 },
    );
    return { jobId, status: 'queued' };
  }

  private rankDrafts(drafts: GeneratedContent[]): GeneratedContent[] {
    const ranked = [...drafts]
      .sort((left, right) => {
        const rightConfidence = right.confidence ?? Number.NEGATIVE_INFINITY;
        const leftConfidence = left.confidence ?? Number.NEGATIVE_INFINITY;
        if (rightConfidence !== leftConfidence) {
          return rightConfidence - leftConfidence;
        }
        return right.content.length - left.content.length;
      })
      .map((draft, index) => ({
        ...draft,
        metadata: { ...draft.metadata, rank: index + 1 },
      }));

    this.logger.log(`${this.context} ranked drafts`, {
      rankedCount: ranked.length,
    });
    return ranked;
  }

  private planBatchAction(request: SystemWorkflowActionRequest): {
    items: BatchContentItem[];
    startedAt: number;
  } {
    const batchRequest = this.readBatchRequest(request.input.request);
    return {
      items: Array.from(
        { length: batchRequest.count },
        (_value, itemIndex) => ({
          ...batchRequest,
          itemIndex,
        }),
      ),
      startedAt: Date.now(),
    };
  }

  private prepareItemAction(request: SystemWorkflowActionRequest): {
    context: {
      brandId: string;
      brandVoice: string;
      organizationId: string;
      platforms: string[];
    };
    params: Record<string, unknown>;
  } {
    const item = this.readBatchItem(request.input.item);
    return {
      context: {
        brandId: item.brandId,
        brandVoice: '',
        organizationId: item.organizationId,
        platforms: [],
      },
      params: item.params ?? {},
    };
  }

  private rankDraftsAction(
    request: SystemWorkflowActionRequest,
  ): BatchContentResult {
    const plan = this.readRecord(request.input.plan, 'plan');
    const batch = this.readForEachResult(request.input.batch);
    const drafts = batch.results
      .sort((left, right) => left.index - right.index)
      .map((entry) => entry.result);
    return {
      duration: Math.max(
        0,
        Date.now() - this.requiredNumber(plan.startedAt, 'startedAt'),
      ),
      results: this.rankDrafts(drafts),
      summary: {
        completed: drafts.length,
        failed: 0,
        total: batch.count,
      },
    };
  }

  private readBatchRequest(value: unknown): BatchContentRequest {
    const record = this.readRecord(value, 'request');
    const count = this.requiredNumber(record.count, 'count');
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      throw new Error('Batch content count must be an integer from 1 to 100');
    }
    return {
      brandId: this.requiredString(record.brandId, 'brandId'),
      count,
      organizationId: this.requiredString(
        record.organizationId,
        'organizationId',
      ),
      params: this.readRecord(record.params, 'params', true),
      skillSlug: this.requiredString(record.skillSlug, 'skillSlug'),
    };
  }

  private readBatchItem(value: unknown): BatchContentItem {
    const request = this.readBatchRequest(value);
    const record = this.readRecord(value, 'item');
    return {
      ...request,
      itemIndex: this.requiredNumber(record.itemIndex, 'itemIndex'),
    };
  }

  private readForEachResult(value: unknown): ForEachResult {
    const record = this.readRecord(value, 'batch');
    if (!Array.isArray(record.results)) {
      throw new Error('Batch content workflow requires generated results');
    }
    return {
      count: this.requiredNumber(record.count, 'count'),
      results: record.results.map((value, position) => {
        const entry = this.readRecord(value, `results[${position}]`);
        return {
          index: this.requiredNumber(entry.index, 'index'),
          result: this.readGeneratedContent(entry.result),
        };
      }),
    };
  }

  private readGeneratedContent(value: unknown): GeneratedContent {
    const record = this.readRecord(value, 'generated content');
    const platforms = Array.isArray(record.platforms)
      ? record.platforms.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];
    return {
      content: this.requiredString(record.content, 'content'),
      ...(typeof record.confidence === 'number'
        ? { confidence: record.confidence }
        : {}),
      ...(Array.isArray(record.mediaUrls)
        ? {
            mediaUrls: record.mediaUrls.filter(
              (item): item is string => typeof item === 'string',
            ),
          }
        : {}),
      metadata: this.readRecord(record.metadata, 'metadata', true),
      platforms,
      skillSlug: this.requiredString(record.skillSlug, 'skillSlug'),
      type: this.requiredString(record.type, 'type'),
    };
  }

  private readRecord(
    value: unknown,
    field: string,
    optional = false,
  ): Record<string, unknown> {
    if (value === undefined && optional) {
      return {};
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Batch content workflow requires ${field}`);
    }
    return value as Record<string, unknown>;
  }

  private requiredNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Batch content workflow requires numeric ${field}`);
    }
    return value;
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Batch content workflow requires ${field}`);
    }
    return value.trim();
  }

  private async validateBrandOwnership(
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    const brand = await this.brandsService.findOne({
      id: brandId,
      organizationId,
    });
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
    if (brand.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Brand does not belong to this organization',
      );
    }
  }
}
