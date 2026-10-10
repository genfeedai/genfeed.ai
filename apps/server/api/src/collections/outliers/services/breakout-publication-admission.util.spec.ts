import { readBreakoutGrowth } from '@api/collections/outliers/services/breakout-growth.util';
import { readBreakoutLiveCapacity } from '@api/collections/outliers/services/breakout-live-capacity.util';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import {
  admitBreakoutPublication,
  type BreakoutPublicationAdmission,
} from '@api/collections/outliers/services/breakout-publication-admission.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandedPostMaterialRecord } from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import {
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
    targetExecutionState: TargetExecutionState.SCHEDULED,
  };
  const output = {
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
      materialHash: hashBrandedGenerationTextV1(content),
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
    post: { findFirst: vi.fn(async () => post) },
    agentStrategy: { findFirst: vi.fn(async () => strategy) },
    contentScore: { findFirst: scoreQuery },
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
          workflowExecutionId: 'execution-a',
          isDeleted: false,
        },
      }),
    );
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
});
