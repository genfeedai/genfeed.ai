import { randomUUID } from 'node:crypto';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  TURBO_CONTENT_ACTION_IDS,
  buildTurboContentWorkflowDefinitions,
  getTurboContentWorkflowId,
} from '@api/services/turbo-content/turbo-content-workflow-definition';
import type {
  TurboContentRequest,
  TurboContentResult,
  QueuedTurboContentResult,
} from '@api/services/turbo-content/interfaces/turbo-content.interfaces';
import type { GeneratedContent } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { isExecutableSkillSlug } from '@api/services/skill-executor/skill-workflow-definition';
import { TURBO_RUN_COUNT_MAXIMUM } from '@genfeedai/contracts/constants';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ForbiddenException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

type TurboContentItem = TurboContentRequest & { itemIndex: number };

type ForEachResult = {
  count: number;
  results: Array<{ index: number; result: GeneratedContent }>;
};

@Injectable()
export class TurboContentService implements OnModuleInit {
  private readonly context = 'TurboContentService';

  constructor(
    private readonly brandsService: BrandsService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      TURBO_CONTENT_ACTION_IDS.PLAN,
      async (request) => this.planTurboRunAction(request),
    );
    this.workflowRunner.registerAction(
      TURBO_CONTENT_ACTION_IDS.PREPARE_ITEM,
      (request) => this.prepareItemAction(request),
    );
    this.workflowRunner.registerAction(
      TURBO_CONTENT_ACTION_IDS.RANK,
      async (request) => this.rankDraftsAction(request),
    );
    for (const definition of buildTurboContentWorkflowDefinitions()) {
      this.workflowRunner.registerWorkflow(definition);
    }
  }

  async queueTurboRun(
    request: TurboContentRequest,
    userId?: string,
  ): Promise<QueuedTurboContentResult> {
    await this.validateBrandOwnership(request.organizationId, request.brandId);
    if (!isExecutableSkillSlug(request.skillSlug)) {
      throw new NotFoundException(`Skill not found: ${request.skillSlug}`);
    }
    const canonicalId = getTurboContentWorkflowId(request.skillSlug);
    return this.workflowRunner.runWithRegisteredWorkflowModule(
      { canonicalId, organizationId: request.organizationId },
      () => this.queueAdmittedTurboRun(request, canonicalId, userId),
    );
  }

  private async queueAdmittedTurboRun(
    request: TurboContentRequest,
    canonicalId: string,
    userId?: string,
  ): Promise<QueuedTurboContentResult> {
    const jobId = await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: canonicalId,
        canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        source: 'TurboContentService.queueTurboRun',
        userId,
      },
      `turbo-content-${randomUUID()}`,
      { attempts: 1, dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE },
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

  private planTurboRunAction(request: SystemWorkflowActionRequest): {
    items: TurboContentItem[];
    startedAt: number;
  } {
    const turboRunRequest = this.readTurboRunRequest(request.input.request);
    return {
      items: Array.from(
        { length: turboRunRequest.count },
        (_value, itemIndex) => ({
          ...turboRunRequest,
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
    const item = this.readTurboRunItem(request.input.item);
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
  ): TurboContentResult {
    const plan = this.readRecord(request.input.plan, 'plan');
    const turboRun = this.readForEachResult(request.input.turboRun);
    const drafts = turboRun.results
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
        total: turboRun.count,
      },
    };
  }

  private readTurboRunRequest(value: unknown): TurboContentRequest {
    const record = this.readRecord(value, 'request');
    const count = this.requiredNumber(record.count, 'count');
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > TURBO_RUN_COUNT_MAXIMUM
    ) {
      throw new Error(
        `Batch content count must be an integer from 1 to ${TURBO_RUN_COUNT_MAXIMUM}`,
      );
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

  private readTurboRunItem(value: unknown): TurboContentItem {
    const request = this.readTurboRunRequest(value);
    const record = this.readRecord(value, 'item');
    return {
      ...request,
      itemIndex: this.requiredNumber(record.itemIndex, 'itemIndex'),
    };
  }

  private readForEachResult(value: unknown): ForEachResult {
    const record = this.readRecord(value, 'turboRun');
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
