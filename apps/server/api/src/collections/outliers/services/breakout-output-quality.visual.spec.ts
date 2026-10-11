import type { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import type { BreakoutGenerationAdmission } from '@api/collections/outliers/services/breakout-generation-admission.util';
import { BreakoutOutputQualityService } from '@api/collections/outliers/services/breakout-output-quality.service';
import { breakoutQualityMaterialHash } from '@api/collections/outliers/services/breakout-quality-material.util';
import type {
  BreakoutVisualPart,
  BreakoutVisualQualityRequest,
  BreakoutVisualQualityService,
} from '@api/collections/outliers/services/breakout-visual-quality.service';
import { BREAKOUT_VISUAL_QUALITY_KEY } from '@api/collections/outliers/services/breakout-visual-quality.util';
import { describeBrandedPostMaterialLayout } from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  IngredientCategory,
  Platform,
  PostCategory,
  PostFormat,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/breakout-generation-admission.util',
  () => ({
    admitBreakoutGenerationContinuation: vi.fn(async () => undefined),
    runWithBreakoutGenerationAdmission: async <T>(
      _prisma: unknown,
      _admission: unknown,
      run: () => Promise<T>,
    ) => run(),
  }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-live-capacity.util',
  () => ({
    readBreakoutLiveCapacity: vi.fn(async () => ({
      status: 'available',
      budget: {
        remainingDailyCredits: 40,
        remainingWeeklyCredits: 40,
        remainingMonthlyCredits: 40,
        remainingPlatformCredits: 40,
        remainingPacingCredits: 40,
        availableOrganizationCredits: 40,
        remainingFormatCredits: {},
      },
    })),
  }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-output-recovery.util',
  () => ({
    readBreakoutOutputRecovery: vi.fn(async () => ({
      status: 'available',
      state: 'draft',
      postId: 'post-a',
      reason: 'publication_admission_required',
    })),
  }),
);

const CAPTION = 'A concrete scene: the team reviewing the new checklist.';

function fixture(
  format: 'image' | 'carousel' | 'video' = 'image',
  platform = Platform.INSTAGRAM,
) {
  const media = format === 'video' ? 'video' : 'image';
  const ids =
    format === 'carousel' ? ['asset-1', 'asset-2', 'asset-3'] : ['asset-1'];
  const reauthorize = vi.fn(async (_tx: Prisma.TransactionClient) => undefined);
  const admission: BreakoutGenerationAdmission = {
    scope: {
      version: 1,
      organizationId: 'org-a',
      brandId: 'brand-a',
      strategyId: 'strategy-a',
      platform,
      format,
    },
    credentialId: 'account-a',
    responseId: 'response-a',
    outputId: 'output-a',
    actorUserId: 'actor-a',
    workflowExecutionId: 'execution-a',
    componentKey: 'generation-a:caption',
    reauthorize,
  };
  const post = {
    id: 'post-a',
    organizationId: 'org-a',
    brandId: 'brand-a',
    isDeleted: false,
    parentId: null,
    order: 0,
    platform,
    credentialId: 'account-a',
    targetAttachments: [] as unknown,
    targetSettings: {},
    category: media === 'video' ? PostCategory.VIDEO : PostCategory.IMAGE,
    format: PostFormat.STANDARD,
    description: CAPTION,
    ingredients: ids.map((id) => ({
      id,
      organizationId: 'org-a',
      brandId: 'brand-a',
      isDeleted: false,
      category:
        media === 'video' ? IngredientCategory.VIDEO : IngredientCategory.IMAGE,
      s3Key: `media/${id}`,
      version: 1,
      fileSize: 5,
      mimeType: media === 'video' ? 'video/mp4' : 'image/png',
      cdnUrl: `https://cdn.test/${id}`,
    })),
    children: [],
  };
  const strategy = {
    id: 'strategy-a',
    isActive: true,
    isEnabled: true,
    brandId: 'brand-a',
    goalProfile: 'reach_traffic',
    publishPolicy: { minPostScore: 70, minImageScore: 75 },
  };
  let heldReason: string | null = null;
  let state = 'reserved';
  let caption: { id: string; data: Prisma.JsonValue } | null = null;
  const visualRows: Array<{ id: string; data: Record<string, unknown> }> = [];
  const tx = {
    $queryRaw: vi.fn(async () => []),
    post: { findFirst: vi.fn(async () => post) },
    agentStrategy: {
      findFirst: vi.fn(async () => ({
        config: { isEnabled: true, goalProfile: strategy.goalProfile },
        policies: { publishPolicy: strategy.publishPolicy },
      })),
    },
    breakoutResponseOutput: {
      findFirst: vi.fn(async () => ({
        generationKey: 'generation-a',
        heldReason,
        state,
      })),
      updateMany: vi.fn(
        async (args: Prisma.BreakoutResponseOutputUpdateManyArgs) => {
          if (args.where?.heldReason === null && heldReason !== null)
            return { count: 0 };
          if (
            typeof args.data.heldReason === 'string' ||
            args.data.heldReason === null
          )
            heldReason = args.data.heldReason;
          if (typeof args.data.state === 'string') state = args.data.state;
          return { count: 1 };
        },
      ),
    },
    contentScore: {
      findFirst: vi.fn(async (args: Prisma.ContentScoreFindFirstArgs) => {
        const expected = args.where?.data;
        const bound = (caption?.data as { breakoutQuality?: unknown } | null)
          ?.breakoutQuality;
        return caption &&
          expected &&
          'equals' in expected &&
          JSON.stringify(bound) === JSON.stringify(expected.equals)
          ? caption
          : null;
      }),
      findMany: vi.fn(async () => visualRows),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(
      async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) =>
        run(tx as unknown as Prisma.TransactionClient),
    ),
  };
  const strategies = { findOneById: vi.fn(async () => strategy) };
  const credits = {
    reserveCredits: vi.fn(async () => ({ id: 'hold', status: 'RESERVED' })),
    settleReservation: vi.fn(async () => undefined),
  };
  let captionScore = 90;
  const optimizers = {
    analyzeContent: vi.fn<OptimizersService['analyzeContent']>(
      async (dto, _org, _actor, _billing, _cap, continuation) => {
        if (!continuation) throw new Error('continuation required');
        await continuation.beforeAttempt(2);
        await continuation.acceptedAttempt(2);
        caption = {
          id: 'score-caption',
          data: {
            content: dto.content,
            overallScore: captionScore,
            metadata: { hasCallToAction: true },
            breakoutQuality: { ...continuation.scoreBinding },
          },
        };
        return { ...caption };
      },
    ),
  };
  let visualScores: number[] = ids.map(() => 88);
  const visual = {
    evaluate: vi.fn(async (request: BreakoutVisualQualityRequest) => {
      for (const [index] of request.parts.entries())
        visualRows.push({
          id: `visual-${index}`,
          data: {
            [BREAKOUT_VISUAL_QUALITY_KEY]: {
              ...request.binding,
              partIndex: index,
            },
            overallScore: visualScores[index],
          },
        });
    }),
  };
  const service = new BreakoutOutputQualityService(
    prisma as unknown as PrismaService,
    strategies as unknown as AgentStrategiesService,
    optimizers as unknown as OptimizersService,
    credits as unknown as CreditsUtilsService,
    visual as unknown as BreakoutVisualQualityService,
  );
  return {
    service,
    request: { admission, postId: 'post-a' },
    post,
    strategy,
    optimizers,
    visual,
    visualRows,
    tx,
    setVisualScores: (scores: number[]) => {
      visualScores = scores;
    },
    setCaptionScore: (value: number) => {
      captionScore = value;
    },
    state: () => ({ heldReason, state }),
  };
}

describe('visual breakout output quality gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scores the caption and every attached visual on the exact composed material', async () => {
    const h = fixture('carousel');
    expect(await h.service.evaluate(h.request)).toEqual({
      state: 'approved',
      scoreId: 'score-caption',
    });
    const layout = describeBrandedPostMaterialLayout(
      { organizationId: 'org-a', brandId: 'brand-a' },
      h.post as never,
    );
    const request = h.visual.evaluate.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      generationKey: 'generation-a',
      caption: CAPTION,
      binding: {
        postId: 'post-a',
        materialHash: breakoutQualityMaterialHash(layout, CAPTION),
      },
    });
    expect(request?.parts.map((part: BreakoutVisualPart) => part.url)).toEqual([
      'https://cdn.test/asset-1',
      'https://cdn.test/asset-2',
      'https://cdn.test/asset-3',
    ]);
    // The caption analysis is the same normal text gate: one call over the caption alone.
    expect(h.optimizers.analyzeContent).toHaveBeenCalledOnce();
    expect(h.optimizers.analyzeContent.mock.calls[0]?.[0].content).toBe(
      CAPTION,
    );
    expect(h.state()).toEqual({ heldReason: null, state: 'generating' });
  });

  it('binds a different identity than the bare caption text, so a swapped visual invalidates the score', async () => {
    const h = fixture('image');
    await h.service.evaluate(h.request);
    const binding = h.visual.evaluate.mock.calls[0]?.[0].binding;
    const swapped = {
      ...h.post,
      ingredients: [
        { ...h.post.ingredients[0], s3Key: 'media/other', version: 2 },
      ],
    };
    const layout = describeBrandedPostMaterialLayout(
      { organizationId: 'org-a', brandId: 'brand-a' },
      swapped as never,
    );
    expect(binding?.materialHash).not.toBe(
      breakoutQualityMaterialHash(layout, CAPTION),
    );
  });

  it('judges a video from its frames with the planned length', async () => {
    const h = fixture('video', Platform.YOUTUBE);
    await h.service.evaluate(h.request);
    expect(h.visual.evaluate.mock.calls[0]?.[0].parts).toEqual([
      {
        url: 'https://cdn.test/asset-1',
        mediaKind: 'video',
        durationSeconds: 10,
      },
    ]);
  });

  it('holds the output when any visual misses the configured visual bar, even with a passing caption', async () => {
    const h = fixture('carousel');
    h.setVisualScores([90, 60, 90]);
    expect(await h.service.evaluate(h.request)).toEqual({
      state: 'held',
      scoreId: 'score-caption',
    });
    expect(h.state()).toEqual({
      heldReason: 'platform_quality_blocked',
      state: 'awaiting_review',
    });
  });

  it('holds the output when the caption misses its bar even with passing visuals', async () => {
    const h = fixture('image');
    h.setCaptionScore(40);
    expect(await h.service.evaluate(h.request)).toMatchObject({
      state: 'held',
    });
  });

  it('evaluates only the visuals an interrupted first pass never reached, without scoring the caption again', async () => {
    const h = fixture('carousel');
    await h.service.evaluate(h.request);
    h.visualRows.length = 1;
    expect(await h.service.evaluate(h.request)).toEqual({
      state: 'approved',
      scoreId: 'score-caption',
    });
    expect(h.visual.evaluate).toHaveBeenCalledTimes(2);
    expect(h.optimizers.analyzeContent).toHaveBeenCalledOnce();
  });

  it('reconciles a visual that already has a retained paid attempt instead of repeating it', async () => {
    const h = fixture('carousel');
    await h.service.evaluate(h.request);
    h.visualRows.length = 1;
    h.visual.evaluate.mockRejectedValueOnce(
      new ConflictException('breakout_quality_paid_retry_held'),
    );
    expect(await h.service.evaluate(h.request)).toEqual({
      state: 'reconciliation_required',
      scoreId: null,
    });
    expect(h.optimizers.analyzeContent).toHaveBeenCalledOnce();
  });

  it('reconciles a visual evaluation that finished without leaving evidence', async () => {
    const h = fixture('carousel');
    await h.service.evaluate(h.request);
    h.visualRows.length = 1;
    h.visual.evaluate.mockResolvedValueOnce(undefined);
    expect(await h.service.evaluate(h.request)).toEqual({
      state: 'reconciliation_required',
      scoreId: null,
    });
  });

  it('surfaces any other failure of the resumed visual evaluation', async () => {
    const h = fixture('carousel');
    await h.service.evaluate(h.request);
    h.visualRows.length = 1;
    h.visual.evaluate.mockRejectedValueOnce(
      new ConflictException('breakout_quality_budget_unavailable'),
    );
    await expect(h.service.evaluate(h.request)).rejects.toThrow(
      'breakout_quality_budget_unavailable',
    );
  });

  it('refuses material that is not exactly the planned visuals', async () => {
    const h = fixture('carousel');
    h.post.ingredients = h.post.ingredients.slice(0, 2);
    await expect(h.service.evaluate(h.request)).rejects.toThrow(
      'breakout_quality_material_changed',
    );
    expect(h.optimizers.analyzeContent).not.toHaveBeenCalled();
    expect(h.visual.evaluate).not.toHaveBeenCalled();
  });

  it('refuses a platform that no longer publishes the format', async () => {
    const h = fixture('image', Platform.YOUTUBE);
    await expect(h.service.evaluate(h.request)).rejects.toThrow(
      'breakout_quality_format_unavailable',
    );
  });
});
