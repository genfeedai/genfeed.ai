import { randomUUID } from 'node:crypto';
import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { VariationGroupScoringService } from '@api/collections/content-performance/services/variation-group-scoring.service';
import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  type PostCreateInput,
  PostsService,
} from '@api/collections/posts/services/posts.service';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { scopedWhere } from '@api/index';
import {
  AB_TEST_OUTCOME_ENTRY_TYPE,
  AB_TEST_SUGGESTION_SOURCE,
  type AbTestOutcome,
  type BrandMemoryOutcomeRow,
  type ExecuteAbTestSuggestionParams,
  type ExecuteAbTestSuggestionResult,
} from '@api/services/content-optimization/ab-test-suggestion-harness.types';
import {
  AB_TEST_ACTION_IDS,
  AB_TEST_WORKFLOW_DEFINITIONS,
  AB_TEST_WORKFLOW_IDS,
} from '@api/services/content-optimization/ab-test-workflow-definition';
import {
  PostFormat,
  PostVisibility,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

type AbTestArm = PostCreateInput & {
  groupId: string;
  suggestionId: string;
};

type AbTestResolutionItem = AbTestOutcome & {
  brandId: string;
  organizationId: string;
};

type ForEachResult<T> = {
  results: Array<{ index: number; result: T }>;
};

@Injectable()
export class AbTestSuggestionHarnessService implements OnModuleInit {
  constructor(
    private readonly postsService: PostsService,
    private readonly variationGroupScoringService: VariationGroupScoringService,
    private readonly brandMemoryService: BrandMemoryService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      AB_TEST_ACTION_IDS.PLAN_EXECUTION,
      async (request) => this.planExecutionAction(request),
    );
    this.workflowRunner.registerAction(
      AB_TEST_ACTION_IDS.CREATE_ARM,
      (request) => this.createArmAction(request),
    );
    this.workflowRunner.registerAction(
      AB_TEST_ACTION_IDS.FINALIZE_EXECUTION,
      async (request) => this.finalizeExecutionAction(request),
    );
    this.workflowRunner.registerAction(
      AB_TEST_ACTION_IDS.PLAN_RESOLUTION,
      (request) => this.planResolutionAction(request),
    );
    this.workflowRunner.registerAction(
      AB_TEST_ACTION_IDS.PERSIST_OUTCOME,
      (request) => this.persistOutcomeAction(request),
    );
    this.workflowRunner.registerAction(
      AB_TEST_ACTION_IDS.FINALIZE_RESOLUTION,
      async (request) => this.finalizeResolutionAction(request),
    );
    this.workflowRunner.registerAction(
      AB_TEST_ACTION_IDS.LOAD_VALIDATED,
      (request) => this.loadValidatedAction(request),
    );
    for (const definition of AB_TEST_WORKFLOW_DEFINITIONS) {
      this.workflowRunner.registerWorkflow(definition);
    }
  }

  async executeSuggestion(
    params: ExecuteAbTestSuggestionParams,
  ): Promise<ExecuteAbTestSuggestionResult> {
    return this.runWorkflow<ExecuteAbTestSuggestionResult>(
      AB_TEST_WORKFLOW_IDS.EXECUTE,
      params.organizationId,
      { params },
      params.userId,
    );
  }

  async resolveOutcomes(
    organizationId: string,
    brandId: string,
  ): Promise<AbTestOutcome[]> {
    return this.runWorkflow<AbTestOutcome[]>(
      AB_TEST_WORKFLOW_IDS.RESOLVE,
      organizationId,
      { brandId, organizationId },
    );
  }

  async getValidatedOutcomes(
    organizationId: string,
    brandId: string,
  ): Promise<AbTestOutcome[]> {
    return this.runWorkflow<AbTestOutcome[]>(
      AB_TEST_WORKFLOW_IDS.LOAD_VALIDATED,
      organizationId,
      { brandId, organizationId },
    );
  }

  private async runWorkflow<T>(
    canonicalId: string,
    organizationId: string,
    request: Record<string, unknown>,
    userId?: string,
  ): Promise<T> {
    const { result } = await this.workflowRunner.runWorkflow<T>({
      actionType: canonicalId,
      canonicalId,
      inputValues: { request },
      organizationId,
      source: `AbTestSuggestionHarnessService.${canonicalId}`,
      userId,
    });
    return result;
  }

  private planExecutionAction(request: SystemWorkflowActionRequest): {
    groupId: string;
    items: AbTestArm[];
    suggestionId: string;
  } {
    const params = this.readExecutionParams(
      this.readRecord(this.readRequest(request).params, 'params'),
    );
    const suggestionId = params.suggestion.suggestionId ?? randomUUID();
    const groupId = randomUUID();
    const platform = parsePlatform(params.suggestion.platform);
    if (!platform) {
      throw new BadRequestException(
        `Unsupported A/B suggestion platform: ${params.suggestion.platform}`,
      );
    }
    const captions = [params.suggestion.variantA, params.suggestion.variantB];
    return {
      groupId,
      items: captions.map((caption, index) => ({
        brandId: params.brandId,
        description: caption,
        format: PostFormat.STANDARD,
        groupId,
        ingredients: [],
        label: `${params.suggestion.variable} arm ${index + 1}`,
        organizationId: params.organizationId,
        platform,
        source: AB_TEST_SUGGESTION_SOURCE,
        sourceActionId: suggestionId,
        sourceWorkflowId: groupId,
        sourceWorkflowName: AB_TEST_SUGGESTION_SOURCE,
        suggestionId,
        targetExecutionState: TargetExecutionState.DRAFT,
        userId: params.userId,
        variantId: `${groupId}:${index + 1}/${captions.length}`,
        visibility: PostVisibility.PUBLIC,
      })),
      suggestionId,
    };
  }

  private async createArmAction(
    request: SystemWorkflowActionRequest,
  ): Promise<{ postId: string }> {
    const item = this.readRecord(request.input.item, 'item') as AbTestArm;
    const { suggestionId: _suggestionId, ...createInput } = item;
    const post = await this.postsService.create(createInput);
    return { postId: String(post.id) };
  }

  private finalizeExecutionAction(
    request: SystemWorkflowActionRequest,
  ): ExecuteAbTestSuggestionResult {
    const plan = this.readRecord(request.input.plan, 'plan');
    const arms = this.readForEachResult<{ postId: string }>(request.input.arms);
    const postIds = arms.results
      .sort((left, right) => left.index - right.index)
      .map((entry) => this.requiredString(entry.result.postId, 'postId'));
    return {
      armCount: postIds.length,
      groupId: this.requiredString(plan.groupId, 'groupId'),
      postIds,
      suggestionId: this.requiredString(plan.suggestionId, 'suggestionId'),
    };
  }

  private async planResolutionAction(
    request: SystemWorkflowActionRequest,
  ): Promise<{ items: AbTestResolutionItem[] }> {
    const input = this.readRequest(request);
    const organizationId = this.requiredString(
      input.organizationId,
      'organizationId',
    );
    const brandId = this.requiredString(input.brandId, 'brandId');
    const experimentPosts = (await this.postsService.find(
      scopedWhere(organizationId, {
        brandId,
        groupId: { not: null },
        source: AB_TEST_SUGGESTION_SOURCE,
      }),
    )) as PostDocument[];
    const suggestionByGroup = new Map<string, string>();
    for (const post of experimentPosts) {
      const groupId = this.readString(post.groupId);
      const suggestionId = this.readString(post.sourceActionId);
      if (groupId && suggestionId && !suggestionByGroup.has(groupId)) {
        suggestionByGroup.set(groupId, suggestionId);
      }
    }
    if (suggestionByGroup.size === 0) {
      return { items: [] };
    }
    const scored = await this.variationGroupScoringService.scoreVariationGroups(
      { brandId, organizationId },
    );
    const scoredByGroup = new Map(
      scored.groups.map((group) => [group.groupId, group]),
    );
    return {
      items: [...suggestionByGroup].map(([groupId, suggestionId]) => {
        const scoredGroup = scoredByGroup.get(groupId);
        const outcome: AbTestOutcome = scoredGroup
          ? {
              groupId,
              status: 'resolved' as const,
              suggestionId,
              winnerPostId: scoredGroup.winner.postId,
              winnerVariantId: scoredGroup.winner.variantId,
            }
          : {
              groupId,
              status: 'insufficient_evidence' as const,
              suggestionId,
            };
        return { ...outcome, brandId, organizationId };
      }),
    };
  }

  private async persistOutcomeAction(
    request: SystemWorkflowActionRequest,
  ): Promise<AbTestOutcome> {
    const item = this.readRecord(request.input.item, 'item');
    const outcome = this.readOutcome(item);
    if (outcome.status === 'resolved') {
      await this.persistResolvedOutcome(
        this.requiredString(item.organizationId, 'organizationId'),
        this.requiredString(item.brandId, 'brandId'),
        outcome,
      );
    }
    return outcome;
  }

  private finalizeResolutionAction(
    request: SystemWorkflowActionRequest,
  ): AbTestOutcome[] {
    return this.readForEachResult<AbTestOutcome>(request.input.outcomes)
      .results.sort((left, right) => left.index - right.index)
      .map((entry) => this.readOutcome(entry.result));
  }

  private async loadValidatedAction(
    request: SystemWorkflowActionRequest,
  ): Promise<AbTestOutcome[]> {
    const input = this.readRequest(request);
    return this.performLoadValidatedOutcomes(
      this.requiredString(input.organizationId, 'organizationId'),
      this.requiredString(input.brandId, 'brandId'),
    );
  }

  private async performLoadValidatedOutcomes(
    organizationId: string,
    brandId: string,
  ): Promise<AbTestOutcome[]> {
    const rows = (await this.brandMemoryService.getMemory(
      organizationId,
      brandId,
    )) as BrandMemoryOutcomeRow[];
    const outcomes: AbTestOutcome[] = [];
    for (const row of rows) {
      for (const entry of row.entries ?? []) {
        if (
          entry.type !== AB_TEST_OUTCOME_ENTRY_TYPE ||
          entry.metadata?.status !== 'resolved'
        ) {
          continue;
        }
        const suggestionId = entry.metadata.suggestionId;
        const groupId = entry.metadata.groupId;
        if (!suggestionId || !groupId) {
          continue;
        }
        const winnerPostId = entry.metadata.winnerPostId;
        const winnerVariantId = entry.metadata.winnerVariantId;
        outcomes.push({
          groupId,
          status: 'resolved',
          suggestionId,
          ...(winnerPostId ? { winnerPostId } : {}),
          ...(winnerVariantId ? { winnerVariantId } : {}),
        });
      }
    }
    return outcomes;
  }

  private async persistResolvedOutcome(
    organizationId: string,
    brandId: string,
    outcome: AbTestOutcome,
  ): Promise<void> {
    await this.brandMemoryService.logEntry(organizationId, brandId, {
      content: `Resolved A/B suggestion ${outcome.suggestionId} with winner ${outcome.winnerVariantId ?? outcome.winnerPostId}`,
      metadata: {
        groupId: outcome.groupId,
        status: outcome.status,
        suggestionId: outcome.suggestionId,
        winnerPostId: outcome.winnerPostId,
        winnerVariantId: outcome.winnerVariantId,
      },
      type: AB_TEST_OUTCOME_ENTRY_TYPE,
    });
  }

  private readExecutionParams(
    value: Record<string, unknown>,
  ): ExecuteAbTestSuggestionParams {
    const suggestion = this.readRecord(value.suggestion, 'suggestion');
    return {
      brandId: this.requiredString(value.brandId, 'brandId'),
      organizationId: this.requiredString(
        value.organizationId,
        'organizationId',
      ),
      suggestion: {
        hypothesis: this.requiredString(suggestion.hypothesis, 'hypothesis'),
        platform: this.requiredString(suggestion.platform, 'platform'),
        ...(this.readString(suggestion.suggestionId)
          ? { suggestionId: this.readString(suggestion.suggestionId) }
          : {}),
        variable: this.requiredString(suggestion.variable, 'variable'),
        variantA: this.requiredString(suggestion.variantA, 'variantA'),
        variantB: this.requiredString(suggestion.variantB, 'variantB'),
      },
      userId: this.requiredString(value.userId, 'userId'),
    };
  }

  private readOutcome(value: unknown): AbTestOutcome {
    const outcome = this.readRecord(value, 'outcome');
    const status = outcome.status;
    if (status !== 'resolved' && status !== 'insufficient_evidence') {
      throw new Error('A/B test outcome requires a supported status');
    }
    return {
      groupId: this.requiredString(outcome.groupId, 'groupId'),
      status,
      suggestionId: this.requiredString(outcome.suggestionId, 'suggestionId'),
      ...(this.readString(outcome.winnerPostId)
        ? { winnerPostId: this.readString(outcome.winnerPostId) }
        : {}),
      ...(this.readString(outcome.winnerVariantId)
        ? { winnerVariantId: this.readString(outcome.winnerVariantId) }
        : {}),
    };
  }

  private readForEachResult<T>(value: unknown): ForEachResult<T> {
    const batch = this.readRecord(value, 'for-each result');
    if (!Array.isArray(batch.results)) {
      throw new Error('A/B test workflow requires child results');
    }
    return { results: batch.results as ForEachResult<T>['results'] };
  }

  private readRequest(
    request: SystemWorkflowActionRequest,
  ): Record<string, unknown> {
    return this.readRecord(request.input.request, 'request');
  }

  private readRecord(value: unknown, field: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`A/B test workflow requires ${field}`);
    }
    return value as Record<string, unknown>;
  }

  private requiredString(value: unknown, field: string): string {
    const resolved = this.readString(value);
    if (!resolved) {
      throw new Error(`A/B test workflow requires ${field}`);
    }
    return resolved;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }
}
