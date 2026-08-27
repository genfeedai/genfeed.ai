import { randomUUID } from 'node:crypto';
import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { VariationGroupScoringService } from '@api/collections/content-performance/services/variation-group-scoring.service';
import type { PostDocument } from '@server/collections/posts/post.schema';
import {
  type PostCreateInput,
  PostsService,
} from '@api/collections/posts/services/posts.service';
import {
  AB_TEST_OUTCOME_ENTRY_TYPE,
  AB_TEST_SUGGESTION_SOURCE,
  type AbTestOutcome,
  type BrandMemoryOutcomeRow,
  type ExecuteAbTestSuggestionParams,
  type ExecuteAbTestSuggestionResult,
} from '@api/services/content-optimization/ab-test-suggestion-harness.types';
import {
  PostFormat,
  PostVisibility,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/enums';
import { scopedWhere } from '@genfeedai/server';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class AbTestSuggestionHarnessService {
  constructor(
    private readonly postsService: PostsService,
    private readonly variationGroupScoringService: VariationGroupScoringService,
    private readonly brandMemoryService: BrandMemoryService,
  ) {}

  async executeSuggestion(
    params: ExecuteAbTestSuggestionParams,
  ): Promise<ExecuteAbTestSuggestionResult> {
    const suggestionId = params.suggestion.suggestionId ?? randomUUID();
    const groupId = randomUUID();
    const arms = [
      params.suggestion.variantA,
      params.suggestion.variantB,
    ] as const;

    const platform = parsePlatform(params.suggestion.platform);
    if (!platform) {
      throw new BadRequestException(
        `Unsupported A/B suggestion platform: ${params.suggestion.platform}`,
      );
    }

    const postIds: string[] = [];
    for (const [index, caption] of arms.entries()) {
      const variantId = `${groupId}:${index + 1}/${arms.length}`;
      const createInput: PostCreateInput = {
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
        targetExecutionState: TargetExecutionState.DRAFT,
        userId: params.userId,
        variantId,
        visibility: PostVisibility.PUBLIC,
      };
      const post = await this.postsService.create(createInput);
      postIds.push(String(post.id));
    }

    return {
      armCount: postIds.length,
      groupId,
      postIds,
      suggestionId,
    };
  }

  async resolveOutcomes(
    organizationId: string,
    brandId: string,
  ): Promise<AbTestOutcome[]> {
    const experimentPosts = (await this.postsService.find(
      scopedWhere(organizationId, {
        brandId,
        source: AB_TEST_SUGGESTION_SOURCE,
        groupId: { not: null },
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
      return [];
    }

    const scored = await this.variationGroupScoringService.scoreVariationGroups(
      { brandId, organizationId },
    );
    const scoredByGroup = new Map(
      scored.groups.map((group) => [group.groupId, group]),
    );

    const outcomes: AbTestOutcome[] = [];
    for (const [groupId, suggestionId] of suggestionByGroup) {
      const scoredGroup = scoredByGroup.get(groupId);
      if (!scoredGroup) {
        outcomes.push({
          groupId,
          status: 'insufficient_evidence',
          suggestionId,
        });
        continue;
      }

      const outcome: AbTestOutcome = {
        groupId,
        status: 'resolved',
        suggestionId,
        winnerPostId: scoredGroup.winner.postId,
        winnerVariantId: scoredGroup.winner.variantId,
      };
      await this.persistResolvedOutcome(organizationId, brandId, outcome);
      outcomes.push(outcome);
    }

    return outcomes;
  }

  async getValidatedOutcomes(
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
        if (entry.type !== AB_TEST_OUTCOME_ENTRY_TYPE) {
          continue;
        }
        if (entry.metadata?.status !== 'resolved') {
          continue;
        }
        const suggestionId = entry.metadata.suggestionId;
        const groupId = entry.metadata.groupId;
        if (!suggestionId || !groupId) {
          continue;
        }
        outcomes.push({
          groupId,
          status: 'resolved',
          suggestionId,
          winnerPostId: entry.metadata.winnerPostId,
          winnerVariantId: entry.metadata.winnerVariantId,
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

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }
}
