import type { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { VariationGroupScoringService } from '@api/collections/content-performance/services/variation-group-scoring.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import { AbTestSuggestionHarnessService } from '@api/services/content-optimization/ab-test-suggestion-harness.service';
import {
  AB_TEST_OUTCOME_ENTRY_TYPE,
  AB_TEST_SUGGESTION_SOURCE,
} from '@api/services/content-optimization/ab-test-suggestion-harness.types';
import { Platform, TargetExecutionState } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const organizationId = 'org-1';
const brandId = 'brand-1';
const userId = 'user-1';

function createHarness() {
  const postsService = {
    create: vi.fn(),
    find: vi.fn(),
  };
  const variationGroupScoringService = {
    scoreVariationGroups: vi.fn(),
  };
  const brandMemoryService = {
    getMemory: vi.fn(),
    logEntry: vi.fn(),
  };

  const service = new AbTestSuggestionHarnessService(
    postsService as unknown as PostsService,
    variationGroupScoringService as unknown as VariationGroupScoringService,
    brandMemoryService as unknown as BrandMemoryService,
  );

  return {
    brandMemoryService,
    postsService,
    service,
    variationGroupScoringService,
  };
}

describe('AbTestSuggestionHarnessService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates two attributed variation arms for an executable suggestion', async () => {
    const harness = createHarness();
    harness.postsService.create
      .mockResolvedValueOnce({ id: 'post-a' })
      .mockResolvedValueOnce({ id: 'post-b' });

    const result = await harness.service.executeSuggestion({
      brandId,
      organizationId,
      suggestion: {
        hypothesis: 'Question hooks outperform statements',
        platform: 'instagram',
        suggestionId: 'sug-hook-1',
        variable: 'hook_style',
        variantA: 'Did you know this?',
        variantB: 'Here is the news.',
      },
      userId,
    });

    expect(result.armCount).toBe(2);
    expect(result.postIds).toEqual(['post-a', 'post-b']);
    expect(result.suggestionId).toBe('sug-hook-1');
    expect(harness.postsService.create).toHaveBeenCalledTimes(2);

    const first = harness.postsService.create.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const second = harness.postsService.create.mock.calls[1]?.[0] as Record<
      string,
      unknown
    >;
    expect(first.groupId).toBe(result.groupId);
    expect(second.groupId).toBe(result.groupId);
    expect(first.source).toBe(AB_TEST_SUGGESTION_SOURCE);
    expect(first.sourceActionId).toBe('sug-hook-1');
    expect(first.variantId).toBe(`${result.groupId}:1/2`);
    expect(second.variantId).toBe(`${result.groupId}:2/2`);
    expect(first.targetExecutionState).toBe(TargetExecutionState.DRAFT);
    expect(first.platform).toBe(Platform.INSTAGRAM);
    expect(first.description).toBe('Did you know this?');
    expect(second.description).toBe('Here is the news.');
  });

  it('rejects an executable suggestion when the platform is unknown', async () => {
    const harness = createHarness();

    await expect(
      harness.service.executeSuggestion({
        brandId,
        organizationId,
        suggestion: {
          hypothesis: 'Question hooks outperform statements',
          platform: 'not-a-platform',
          suggestionId: 'sug-hook-1',
          variable: 'hook_style',
          variantA: 'Did you know this?',
          variantB: 'Here is the news.',
        },
        userId,
      }),
    ).rejects.toThrow(/Unsupported A\/B suggestion platform/);
    expect(harness.postsService.create).not.toHaveBeenCalled();
  });

  it('persists a resolved outcome when post-publish scoring has a winner', async () => {
    const harness = createHarness();
    harness.postsService.find.mockResolvedValue([
      {
        groupId: 'group-1',
        id: 'post-a',
        source: AB_TEST_SUGGESTION_SOURCE,
        sourceActionId: 'sug-hook-1',
      },
      {
        groupId: 'group-1',
        id: 'post-b',
        source: AB_TEST_SUGGESTION_SOURCE,
        sourceActionId: 'sug-hook-1',
      },
    ]);
    harness.variationGroupScoringService.scoreVariationGroups.mockResolvedValue(
      {
        groups: [
          {
            groupId: 'group-1',
            scores: [],
            winner: { postId: 'post-a', variantId: 'group-1:1/2' },
          },
        ],
      },
    );
    harness.brandMemoryService.logEntry.mockResolvedValue(undefined);

    const outcomes = await harness.service.resolveOutcomes(
      organizationId,
      brandId,
    );

    expect(outcomes).toEqual([
      {
        groupId: 'group-1',
        status: 'resolved',
        suggestionId: 'sug-hook-1',
        winnerPostId: 'post-a',
        winnerVariantId: 'group-1:1/2',
      },
    ]);
    expect(harness.brandMemoryService.logEntry).toHaveBeenCalledWith(
      organizationId,
      brandId,
      expect.objectContaining({
        metadata: expect.objectContaining({
          status: 'resolved',
          suggestionId: 'sug-hook-1',
        }),
        type: AB_TEST_OUTCOME_ENTRY_TYPE,
      }),
    );
  });

  it('keeps insufficient evidence unresolved and does not persist a winner', async () => {
    const harness = createHarness();
    harness.postsService.find.mockResolvedValue([
      {
        groupId: 'group-1',
        id: 'post-a',
        source: AB_TEST_SUGGESTION_SOURCE,
        sourceActionId: 'sug-hook-1',
      },
    ]);
    harness.variationGroupScoringService.scoreVariationGroups.mockResolvedValue(
      {
        groups: [],
      },
    );

    const outcomes = await harness.service.resolveOutcomes(
      organizationId,
      brandId,
    );

    expect(outcomes).toEqual([
      {
        groupId: 'group-1',
        status: 'insufficient_evidence',
        suggestionId: 'sug-hook-1',
      },
    ]);
    expect(harness.brandMemoryService.logEntry).not.toHaveBeenCalled();
  });

  it('treats only resolved brand-memory outcomes as validated learnings', async () => {
    const harness = createHarness();
    harness.brandMemoryService.getMemory.mockResolvedValue([
      {
        entries: [
          {
            metadata: {
              groupId: 'group-1',
              status: 'resolved',
              suggestionId: 'sug-hook-1',
              winnerVariantId: 'v-a',
            },
            type: AB_TEST_OUTCOME_ENTRY_TYPE,
          },
          {
            metadata: {
              groupId: 'group-2',
              status: 'insufficient_evidence',
              suggestionId: 'sug-hook-2',
            },
            type: AB_TEST_OUTCOME_ENTRY_TYPE,
          },
          {
            metadata: { suggestionId: 'other' },
            type: 'optimization_auto_apply',
          },
        ],
      },
    ]);

    const validated = await harness.service.getValidatedOutcomes(
      organizationId,
      brandId,
    );

    expect(validated).toEqual([
      {
        groupId: 'group-1',
        status: 'resolved',
        suggestionId: 'sug-hook-1',
        winnerVariantId: 'v-a',
      },
    ]);
  });
});
