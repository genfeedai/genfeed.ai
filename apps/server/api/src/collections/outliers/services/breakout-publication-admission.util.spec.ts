import { readBreakoutGrowth } from '@api/collections/outliers/services/breakout-growth.util';
import { readBreakoutLiveCapacity } from '@api/collections/outliers/services/breakout-live-capacity.util';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import {
  admitBreakoutPublication,
  type BreakoutPublicationAdmission,
} from '@api/collections/outliers/services/breakout-publication-admission.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { breakoutQualityMaterialHash } from '@api/collections/outliers/services/breakout-quality-material.util';
import { BREAKOUT_VISUAL_QUALITY_KEY } from '@api/collections/outliers/services/breakout-visual-quality.util';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandedPostMaterialRecord } from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import { describeBrandedPostMaterialLayout } from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import {
  IngredientCategory,
  Platform,
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { BreakoutPublicationSourceV1 } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/collections/outliers/services/breakout-growth.util', () => ({
  readBreakoutGrowth: vi.fn(),
}));
vi.mock(
  '@api/collections/outliers/services/breakout-live-capacity.util',
  () => ({ readBreakoutLiveCapacity: vi.fn() }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-output-recovery.util',
  () => ({ readBreakoutOutputRecovery: vi.fn() }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-publication-source.util',
  () => ({ loadBreakoutPublication: vi.fn() }),
);

const source: BreakoutPublicationSourceV1 = {
  version: 1,
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'account-a',
  platform: Platform.TWITTER,
  postId: 'original-a',
  externalId: 'tweet-a',
  format: 'text',
  publishedAt: '2026-10-08T12:00:00.000Z',
  contentDigest: 'digest-a',
  publicationFingerprint: 'publication-a',
  logicalPostId: 'logical-a',
  isResponse: false,
};
const nowMs = Date.parse('2026-10-09T12:00:00.000Z');
function fixture() {
  const reauthorize = vi.fn(async (_tx: Prisma.TransactionClient) => undefined);
  const admission: BreakoutPublicationAdmission = {
    scope: {
      organizationId: 'org-a',
      brandId: 'brand-a',
      credentialId: 'account-a',
      platform: Platform.TWITTER,
      responseId: 'response-a',
      outputId: 'output-a',
    },
    strategyId: 'strategy-a',
    postId: 'post-a',
    workflowExecutionId: 'execution-a',
    phase: 'schedule',
    reauthorize,
  };
  const material: BrandedPostMaterialRecord = {
    id: 'post-a',
    organizationId: 'org-a',
    brandId: 'brand-a',
    credentialId: 'account-a',
    platform: Platform.TWITTER,
    parentId: null,
    isDeleted: false,
    order: 0,
    category: PostCategory.TEXT,
    format: PostFormat.STANDARD,
    description: 'One useful example: reply with yours.',
    targetAttachments: [],
    targetSettings: {},
    ingredients: [],
    children: [],
  };
  const post = {
    ...material,
    groupId: 'group-a',
    quoteTweetId: null as string | null,
    // Delivery restamps this on every retry and accept; the admission must not read it.
    workflowExecutionId: 'execution-delivery',
    targetExecutionState: TargetExecutionState.SCHEDULED,
  };
  const output = {
    kind: 'follow_up',
    format: 'text',
    ordinal: 1,
    heldReason: null as string | null,
    state: 'generating',
  };
  const response = {
    outputPlanFingerprint: 'plan-a',
    sourcePostId: 'original-a',
    nativeSourcePostId: null,
    externalId: source.externalId,
    logicalPostId: source.logicalPostId,
    contentDigest: source.contentDigest,
    publicationFingerprint: source.publicationFingerprint,
    triggerReceiptId: 'baseline-a',
  };
  const strategy = {
    config: { isEnabled: true, goalProfile: 'reach_traffic' },
    policies: { publishPolicy: { minPostScore: 70 } },
  };
  let content = post.description;
  let materialHash = (): string => hashBrandedGenerationTextV1(content);
  const visualRows: Array<{ id: string; data: Record<string, unknown> }> = [];
  const score = {
    id: 'score-a',
    data: { content, overallScore: 85, metadata: { hasCallToAction: true } },
  };
  const scoreQuery = vi.fn(async (args: Prisma.ContentScoreFindFirstArgs) => {
    const filter = args.where?.data;
    if (!filter || !('equals' in filter)) return null;
    const expected = {
      responseId: 'response-a',
      outputId: 'output-a',
      postId: 'post-a',
      strategyId: 'strategy-a',
      workflowExecutionId: 'execution-a',
      materialHash: materialHash(),
    };
    return JSON.stringify(filter.equals) === JSON.stringify(expected)
      ? score
      : null;
  });
  const tx = {
    $queryRaw: vi.fn(async () => []),
    breakoutResponse: { findFirst: vi.fn(async () => response) },
    breakoutResponseOutput: { findFirst: vi.fn(async () => output) },
    breakoutBaselineReceipt: {
      findFirst: vi.fn(async () => ({ metric: 'views' })),
    },
    post: {
      findFirst: vi.fn(async (args: Prisma.PostFindFirstArgs) => {
        const pinned = args.where?.workflowExecutionId;
        return pinned !== undefined && pinned !== post.workflowExecutionId
          ? null
          : post;
      }),
    },
    agentStrategy: { findFirst: vi.fn(async () => strategy) },
    contentScore: {
      findFirst: scoreQuery,
      findMany: vi.fn(async () => visualRows),
    },
  };
  return {
    admission,
    reauthorize,
    post,
    output,
    response,
    strategy,
    score,
    scoreQuery,
    raw: tx,
    tx: tx as unknown as Prisma.TransactionClient,
    visualRows,
    setMaterialHash(next: () => string) {
      materialHash = next;
    },
    setScoredContent(value: string) {
      content = value;
      score.data.content = value;
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadBreakoutPublication).mockResolvedValue(source);
  vi.mocked(readBreakoutGrowth).mockResolvedValue({
    status: 'growing',
    observationIds: ['a', 'b', 'c'],
    measuredAt: new Date(nowMs).toISOString(),
    increment: 100,
    ratePerHour: 600,
    resumed: false,
  });
  vi.mocked(readBreakoutOutputRecovery).mockResolvedValue({
    status: 'available',
    responseId: 'response-a',
    outputId: 'output-a',
    state: 'scheduled',
    reason: 'publication_admission_required',
    action: 'none',
    mayRepeatPaidRequest: false,
    postId: 'post-a',
    externalId: null,
  });
  vi.mocked(readBreakoutLiveCapacity).mockResolvedValue({
    status: 'available',
    strategyId: 'strategy-a',
    capturedAt: new Date(nowMs).toISOString(),
    walletVersion: 1,
    capUsageBasis: 'monthly_ledger_and_reservations',
    cadenceTruncated: false,
    remainingPublicationSlots: 1,
    budget: {
      remainingDailyCredits: 0,
      remainingWeeklyCredits: 0,
      remainingMonthlyCredits: 0,
      availableOrganizationCredits: 0,
      remainingPlatformCredits: 0,
      remainingPacingCredits: 0,
      remainingFormatCredits: {},
    },
  });
});
describe('fresh business evidence before native breakout publication', () => {
  it('checks actual root score material and excludes the already counted canonical publication group', async () => {
    const h = fixture();
    expect(await admitBreakoutPublication(h.tx, h.admission, nowMs)).toEqual({
      scoreId: 'score-a',
    });
    expect(readBreakoutLiveCapacity).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        organizationId: 'org-a',
        brandId: 'brand-a',
        strategyId: 'strategy-a',
        credentialId: 'account-a',
        nowMs,
      }),
      { postId: 'post-a', groupId: 'group-a' },
    );
    expect(h.raw.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'post-a',
          organizationId: 'org-a',
          brandId: 'brand-a',
          credentialId: 'account-a',
          platform: Platform.TWITTER,
          parentId: null,
          breakoutOutputId: 'output-a',
          agentStrategyId: 'strategy-a',
          isDeleted: false,
        },
      }),
    );
  });
  it('admits a retry after delivery restamped the post, pinning the generating execution on the output and score', async () => {
    const h = fixture();
    expect(h.post.workflowExecutionId).not.toBe(
      h.admission.workflowExecutionId,
    );
    for (const phase of ['schedule', 'dispatch'] as const) {
      h.post.targetExecutionState =
        phase === 'dispatch'
          ? TargetExecutionState.PUBLISHING
          : TargetExecutionState.SCHEDULED;
      vi.mocked(readBreakoutOutputRecovery).mockResolvedValue({
        status: 'available',
        responseId: 'response-a',
        outputId: 'output-a',
        state: phase === 'dispatch' ? 'publishing' : 'scheduled',
        reason:
          phase === 'dispatch'
            ? 'publication_in_flight'
            : 'publication_admission_required',
        action: phase === 'dispatch' ? 'wait' : 'none',
        mayRepeatPaidRequest: false,
        postId: 'post-a',
        externalId: null,
      });
      expect(
        await admitBreakoutPublication(h.tx, { ...h.admission, phase }, nowMs),
      ).toEqual({ scoreId: 'score-a' });
    }
    expect(h.raw.breakoutResponseOutput.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workflowExecutionId: 'execution-a' }),
      }),
    );
    expect(h.scoreQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          data: {
            path: ['breakoutQuality'],
            equals: expect.objectContaining({
              workflowExecutionId: 'execution-a',
            }),
          },
        }),
      }),
    );
  });
  it('holds an output that another execution generated', async () => {
    const h = fixture();
    h.raw.breakoutResponseOutput.findFirst.mockResolvedValue(null as never);
    await expect(
      admitBreakoutPublication(h.tx, h.admission, nowMs),
    ).rejects.toThrow('output_unavailable');
  });
  describe('quote binding', () => {
    it('lets a quote output publish only through its own source link', async () => {
      const h = fixture();
      h.output.kind = 'quote';
      h.post.quoteTweetId = source.externalId;
      expect(await admitBreakoutPublication(h.tx, h.admission, nowMs)).toEqual({
        scoreId: 'score-a',
      });
      for (const changed of [null, 'tweet-other']) {
        h.post.quoteTweetId = changed;
        await expect(
          admitBreakoutPublication(h.tx, h.admission, nowMs),
        ).rejects.toThrow('quote_binding_changed');
      }
    });
    it('holds a quote output whose response has no source link', async () => {
      const h = fixture();
      h.output.kind = 'quote';
      h.response.externalId = null as never;
      h.post.quoteTweetId = null;
      await expect(
        admitBreakoutPublication(h.tx, h.admission, nowMs),
      ).rejects.toThrow('quote_binding_changed');
    });
    it('holds an output that is not a quote but carries a quote link', async () => {
      const h = fixture();
      h.post.quoteTweetId = source.externalId;
      await expect(
        admitBreakoutPublication(h.tx, h.admission, nowMs),
      ).rejects.toThrow('quote_binding_changed');
      h.post.quoteTweetId = null;
      expect(await admitBreakoutPublication(h.tx, h.admission, nowMs)).toEqual({
        scoreId: 'score-a',
      });
    });
    it('checks the link before reading quality or capacity', async () => {
      const h = fixture();
      h.post.quoteTweetId = 'tweet-other';
      await expect(
        admitBreakoutPublication(h.tx, h.admission, nowMs),
      ).rejects.toThrow('quote_binding_changed');
      expect(h.scoreQuery).not.toHaveBeenCalled();
      expect(readBreakoutLiveCapacity).not.toHaveBeenCalled();
    });
  });
  it('requires a whole-thread score, including root and ordered child material', async () => {
    const h = fixture();
    h.post.format = PostFormat.THREAD;
    const { children: _children, ...segment } = h.post;
    h.post.children = [
      {
        ...segment,
        id: 'child-a',
        parentId: 'post-a',
        order: 1,
        description: 'Second useful point.',
        children: [],
      },
    ];
    await expect(
      admitBreakoutPublication(h.tx, h.admission, nowMs),
    ).rejects.toThrow('quality_evidence_unavailable');
    h.setScoredContent(`${h.post.description}\n\nSecond useful point.`);
    expect(await admitBreakoutPublication(h.tx, h.admission, nowMs)).toEqual({
      scoreId: 'score-a',
    });
  });
  it('uses the current normal score threshold and traffic CTA requirement without another paid evaluation', async () => {
    const h = fixture();
    h.strategy.policies.publishPolicy.minPostScore = 90;
    await expect(
      admitBreakoutPublication(h.tx, h.admission, nowMs),
    ).rejects.toThrow('platform_quality_blocked');
    h.strategy.policies.publishPolicy.minPostScore = 70;
    h.score.data.metadata.hasCallToAction = false;
    await expect(
      admitBreakoutPublication(h.tx, h.admission, nowMs),
    ).rejects.toThrow('platform_quality_blocked');
  });
  it('holds edited source or material and faded or stale growth before the capacity read', async () => {
    const h = fixture();
    h.response.contentDigest = 'edited';
    await expect(
      admitBreakoutPublication(h.tx, h.admission, nowMs),
    ).rejects.toThrow('source_changed');
    h.response.contentDigest = source.contentDigest;
    for (const reason of ['growth_faded', 'growth_evidence_stale'] as const) {
      vi.mocked(readBreakoutGrowth).mockResolvedValue({
        status: 'held',
        reason,
      });
      await expect(
        admitBreakoutPublication(h.tx, h.admission, nowMs),
      ).rejects.toThrow(reason);
    }
    expect(readBreakoutLiveCapacity).not.toHaveBeenCalled();
  });
  it('never grants dispatch for pending generation or uncertain provider recovery', async () => {
    const h = fixture();
    h.output.heldReason = 'quality_evaluation_pending';
    await expect(
      admitBreakoutPublication(h.tx, h.admission, nowMs),
    ).rejects.toThrow('output_unavailable');
    h.output.heldReason = null;
    vi.mocked(readBreakoutOutputRecovery).mockResolvedValue({
      status: 'available',
      responseId: 'response-a',
      outputId: 'output-a',
      state: 'reconciliation_required',
      reason: 'generation_outcome_indeterminate',
      action: 'reconcile',
      mayRepeatPaidRequest: false,
      postId: 'post-a',
      externalId: null,
    });
    await expect(
      admitBreakoutPublication(h.tx, h.admission, nowMs),
    ).rejects.toThrow('generation_outcome_indeterminate');
  });
  it('only permits the normal claimed publishing state for the native dispatch phase', async () => {
    const h = fixture();
    h.post.targetExecutionState = TargetExecutionState.PUBLISHING;
    vi.mocked(readBreakoutOutputRecovery).mockResolvedValue({
      status: 'available',
      responseId: 'response-a',
      outputId: 'output-a',
      state: 'publishing',
      reason: 'publication_in_flight',
      action: 'wait',
      mayRepeatPaidRequest: false,
      postId: 'post-a',
      externalId: null,
    });
    await expect(
      admitBreakoutPublication(h.tx, h.admission, nowMs),
    ).rejects.toThrow('publication_in_flight');
    expect(
      await admitBreakoutPublication(
        h.tx,
        { ...h.admission, phase: 'dispatch' },
        nowMs,
      ),
    ).toEqual({ scoreId: 'score-a' });
  });
  it('checks native authority before lookup and after private awaits, including the final capacity read', async () => {
    const h = fixture();
    h.reauthorize.mockRejectedValueOnce(new Error('current key revoked'));
    await expect(
      admitBreakoutPublication(h.tx, h.admission, nowMs),
    ).rejects.toThrow('current key revoked');
    expect(h.raw.breakoutResponse.findFirst).not.toHaveBeenCalled();
    vi.mocked(readBreakoutLiveCapacity).mockImplementationOnce(async () => {
      h.reauthorize.mockRejectedValueOnce(new Error('current key revoked'));
      return { status: 'held', reason: 'missing_strategy' };
    });
    await expect(
      admitBreakoutPublication(h.tx, h.admission, nowMs),
    ).rejects.toThrow('current key revoked');
  });
  it('holds unavailable or exhausted quota without inventing a slot', async () => {
    const h = fixture();
    for (const remainingPublicationSlots of [null, 0]) {
      const base = vi.mocked(readBreakoutLiveCapacity).getMockImplementation();
      const capacity = base
        ? await base(h.tx, {
            ...h.admission.scope,
            strategyId: 'strategy-a',
            nowMs,
          })
        : null;
      if (capacity?.status !== 'available')
        throw new Error('fixture capacity missing');
      vi.mocked(readBreakoutLiveCapacity).mockResolvedValueOnce({
        ...capacity,
        remainingPublicationSlots,
      });
      await expect(
        admitBreakoutPublication(h.tx, h.admission, nowMs),
      ).rejects.toThrow(
        remainingPublicationSlots === null
          ? 'quota_unavailable'
          : 'quota_exhausted',
      );
    }
  });

  describe('visual outputs', () => {
    function visual(
      format: 'image' | 'carousel' | 'video' | 'short',
      platform: Platform = Platform.INSTAGRAM,
    ) {
      const h = fixture();
      const video = format === 'video' || format === 'short';
      const ids =
        format === 'carousel' ? ['asset-1', 'asset-2', 'asset-3'] : ['asset-1'];
      h.admission = {
        ...h.admission,
        scope: { ...h.admission.scope, platform },
      } as never;
      h.output.format = format;
      Object.assign(h.post, {
        platform,
        category:
          format === 'short'
            ? PostCategory.REEL
            : video
              ? PostCategory.VIDEO
              : PostCategory.IMAGE,
        ingredients: ids.map((id) => ({
          id,
          organizationId: 'org-a',
          brandId: 'brand-a',
          isDeleted: false,
          category: video ? IngredientCategory.VIDEO : IngredientCategory.IMAGE,
          s3Key: `media/${id}`,
          version: 1,
          fileSize: 5,
          mimeType: video ? 'video/mp4' : 'image/png',
          cdnUrl: `https://cdn.test/${id}`,
        })),
      });
      h.strategy.policies.publishPolicy = {
        minPostScore: 70,
        minImageScore: 75,
      } as never;
      const hashNow = () =>
        breakoutQualityMaterialHash(
          describeBrandedPostMaterialLayout(
            { organizationId: 'org-a', brandId: 'brand-a' },
            h.post as never,
          ),
          h.post.description,
        );
      h.setMaterialHash(hashNow);
      const retainVisuals = (scores: number[]) => {
        h.visualRows.length = 0;
        for (const [partIndex, overallScore] of scores.entries())
          h.visualRows.push({
            id: `visual-${partIndex}`,
            data: {
              [BREAKOUT_VISUAL_QUALITY_KEY]: {
                responseId: 'response-a',
                outputId: 'output-a',
                postId: 'post-a',
                strategyId: 'strategy-a',
                workflowExecutionId: 'execution-a',
                materialHash: hashNow(),
                partIndex,
              },
              overallScore,
            },
          });
      };
      retainVisuals(ids.map(() => 88));
      return { h, ids, retainVisuals };
    }

    it.each([
      ['image', Platform.INSTAGRAM],
      ['carousel', Platform.INSTAGRAM],
      ['video', Platform.YOUTUBE],
      ['short', Platform.TIKTOK],
    ] as const)(
      'admits a %s on %s with current caption and per-visual evidence',
      async (format, platform) => {
        const { h } = visual(format, platform);
        expect(
          await admitBreakoutPublication(h.tx, h.admission, nowMs),
        ).toEqual({
          scoreId: 'score-a',
        });
      },
    );

    it('holds when a visual’s retained evidence is missing or was earned on other material', async () => {
      const { h, retainVisuals } = visual('carousel');
      retainVisuals([88, 88]);
      await expect(
        admitBreakoutPublication(h.tx, h.admission, nowMs),
      ).rejects.toThrow('quality_evidence_unavailable');
      retainVisuals([88, 88, 88]);
      h.post.ingredients[0].version = 2;
      await expect(
        admitBreakoutPublication(h.tx, h.admission, nowMs),
      ).rejects.toThrow('quality_evidence_unavailable');
    });

    it('holds when any visual misses the strategy’s visual bar', async () => {
      const { h, retainVisuals } = visual('carousel');
      retainVisuals([90, 74, 90]);
      await expect(
        admitBreakoutPublication(h.tx, h.admission, nowMs),
      ).rejects.toThrow('platform_quality_blocked');
      h.strategy.policies.publishPolicy = {
        minPostScore: 70,
        minImageScore: 70,
      } as never;
      expect(await admitBreakoutPublication(h.tx, h.admission, nowMs)).toEqual({
        scoreId: 'score-a',
      });
    });

    it.each([
      ['image', Platform.YOUTUBE, 'format_unsupported_for_platform'],
      ['video', Platform.FACEBOOK, 'platform_publishing_unavailable'],
      ['short', Platform.LINKEDIN, 'format_unsupported_for_platform'],
    ] as const)(
      're-reads the channel catalog: a %s on %s is held as %s',
      async (format, platform, reason) => {
        const { h } = visual(format, platform);
        await expect(
          admitBreakoutPublication(h.tx, h.admission, nowMs),
        ).rejects.toThrow(reason);
      },
    );

    it('holds material that is not exactly the planned visuals or lost a visual', async () => {
      const { h } = visual('carousel');
      h.post.ingredients = h.post.ingredients.slice(0, 2);
      await expect(
        admitBreakoutPublication(h.tx, h.admission, nowMs),
      ).rejects.toThrow('format_capability_unavailable');
    });

    it('holds a text output whose post gained media', async () => {
      const h = fixture();
      Object.assign(h.post, {
        category: PostCategory.IMAGE,
        ingredients: [
          {
            id: 'asset-1',
            organizationId: 'org-a',
            brandId: 'brand-a',
            isDeleted: false,
            category: IngredientCategory.IMAGE,
            s3Key: 'media/asset-1',
            version: 1,
            fileSize: 5,
            mimeType: 'image/png',
            cdnUrl: 'https://cdn.test/asset-1',
          },
        ],
      });
      await expect(
        admitBreakoutPublication(h.tx, h.admission, nowMs),
      ).rejects.toThrow('format_capability_unavailable');
    });
  });
});
