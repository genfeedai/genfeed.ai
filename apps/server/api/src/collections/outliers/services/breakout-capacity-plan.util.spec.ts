import {
  reserveBreakoutCapacityPlan,
  reserveBreakoutLiveCapacityPlan,
} from '@api/collections/outliers/services/breakout-capacity-plan.util';
import { readBreakoutGrowth } from '@api/collections/outliers/services/breakout-growth.util';
import { readBreakoutLiveCapacity } from '@api/collections/outliers/services/breakout-live-capacity.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { reserveBreakoutOutputPlan } from '@api/collections/outliers/services/breakout-response-identity.util';
import { Platform } from '@genfeedai/contracts';
import type {
  BreakoutCapacityReservationInput,
  BreakoutPublicationSource,
  BreakoutPublicationSourceV1,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/breakout-response-identity.util',
  () => ({ reserveBreakoutOutputPlan: vi.fn() }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-publication-source.util',
  () => ({
    loadBreakoutPublication: vi.fn(),
    breakoutPublicationId: (source: BreakoutPublicationSource) =>
      'postId' in source ? source.postId : source.sourcePostId,
  }),
);

vi.mock(
  '@api/collections/outliers/services/breakout-live-capacity.util',
  () => ({ readBreakoutLiveCapacity: vi.fn() }),
);
vi.mock('@api/collections/outliers/services/breakout-growth.util', () => ({
  readBreakoutGrowth: vi.fn(),
}));

const source: BreakoutPublicationSourceV1 = {
  version: 1,
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.TWITTER,
  postId: 'post-a',
  externalId: 'tweet-a',
  format: 'text',
  publishedAt: '2026-10-08T12:00:00.000Z',
  contentDigest: 'content-a',
  publicationFingerprint: 'publication-a',
  logicalPostId: 'logical-a',
  isResponse: false,
};
function fixture() {
  const input: BreakoutCapacityReservationInput = {
    responseId: 'response-a',
    source,
    requestedTotalOutputs: 5,
    remainingPublicationSlots: 5,
    supportedFormats: ['text'],
    costsByFormat: { text: { generationCredits: 4, qualityCredits: 1 } },
    budget: {
      availableOrganizationCredits: 100,
      remainingDailyCredits: 100,
      remainingWeeklyCredits: 100,
      remainingMonthlyCredits: 100,
      remainingPlatformCredits: 100,
      remainingPacingCredits: 100,
      remainingFormatCredits: {},
    },
  };
  const response = {
    id: input.responseId,
    sourcePostId: source.postId as string | null,
    nativeSourcePostId: null as string | null,
    externalId: source.externalId,
    logicalPostId: source.logicalPostId,
    contentDigest: source.contentDigest,
    publicationFingerprint: source.publicationFingerprint,
    outputPlanFingerprint: null as string | null,
    triggerReceiptId: 'trigger-a',
  };
  const findResponse = vi.fn(async () => response);
  const findOutputs = vi.fn(async () => [
    { ordinal: 1, kind: 'quote', format: 'text' },
  ]);
  const tx = {
    $queryRaw: vi.fn(async () => []),
    breakoutResponse: { findFirst: findResponse },
    breakoutResponseOutput: { findMany: findOutputs },
    breakoutBaselineReceipt: {
      findFirst: vi.fn(async () => ({ metric: 'views' })),
    },
  } as unknown as Prisma.TransactionClient;
  return { input, response, findResponse, findOutputs, tx };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readBreakoutGrowth).mockResolvedValue({
    status: 'growing',
    observationIds: ['latest', 'previous'],
    measuredAt: source.publishedAt,
    increment: 100,
    ratePerHour: 600,
    resumed: false,
  });
  vi.mocked(loadBreakoutPublication).mockResolvedValue(source);
  vi.mocked(reserveBreakoutOutputPlan).mockResolvedValue({
    status: 'reserved',
    outputIds: ['output-a'],
    generationKeys: ['generation-a'],
  });
});
describe('capacity snapshot to immutable output identities', () => {
  it.each([false, true])(
    'holds faded growth before reservation or retained plan replay (replay=%s)',
    async (replay) => {
      const h = fixture();
      if (replay) h.response.outputPlanFingerprint = 'existing-plan';
      vi.mocked(readBreakoutGrowth).mockResolvedValue({
        status: 'held',
        reason: 'growth_faded',
      });
      expect(await reserveBreakoutCapacityPlan(h.tx, h.input)).toEqual({
        status: 'growth_held',
        reason: 'growth_faded',
      });
      expect(reserveBreakoutOutputPlan).not.toHaveBeenCalled();
      expect(h.findOutputs).not.toHaveBeenCalled();
    },
  );
  it('reserves from the fresh reachable wallet/cadence snapshot rather than caller-provided budget', async () => {
    const h = fixture();
    vi.mocked(readBreakoutLiveCapacity).mockResolvedValue({
      status: 'available',
      capturedAt: source.publishedAt,
      strategyId: 'strategy-a',
      walletVersion: 4,
      capUsageBasis: 'configured_cap_usage_unavailable',
      cadenceTruncated: false,
      remainingPublicationSlots: 2,
      budget: { ...h.input.budget, availableOrganizationCredits: 10 },
    });
    const {
      budget: _budget,
      remainingPublicationSlots: _slots,
      ...input
    } = h.input;
    expect(
      await reserveBreakoutLiveCapacityPlan(h.tx, {
        ...input,
        strategyId: 'strategy-a',
        nowMs: Date.parse(source.publishedAt),
      }),
    ).toMatchObject({
      status: 'reserved',
      estimate: { selectedTotalOutputs: 2, estimatedCredits: 10 },
    });
    expect(readBreakoutLiveCapacity).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        organizationId: source.organizationId,
        brandId: source.brandId,
        credentialId: source.credentialId,
        platform: source.platform,
        strategyId: 'strategy-a',
      }),
    );
  });

  it('does not reserve or substitute another wallet when live capacity is unavailable', async () => {
    const h = fixture();
    vi.mocked(readBreakoutLiveCapacity).mockResolvedValue({
      status: 'held',
      reason: 'wallet_unavailable',
    });
    const {
      budget: _budget,
      remainingPublicationSlots: _slots,
      ...input
    } = h.input;
    expect(
      await reserveBreakoutLiveCapacityPlan(h.tx, {
        ...input,
        strategyId: 'strategy-a',
        nowMs: Date.parse(source.publishedAt),
      }),
    ).toEqual({ status: 'held', reason: 'wallet_unavailable' });
    expect(h.findResponse).not.toHaveBeenCalled();
    expect(reserveBreakoutOutputPlan).not.toHaveBeenCalled();
  });

  it('plans from native evidence without assigning a Genfeed source Post', async () => {
    const h = fixture();
    const { postId: _postId, ...material } = source;
    const native: BreakoutPublicationSource = {
      ...material,
      sourceKind: 'native_source_post',
      sourcePostId: 'native-a',
    };
    h.response.sourcePostId = null;
    h.response.nativeSourcePostId = 'native-a';
    h.input.source = native;
    vi.mocked(loadBreakoutPublication).mockResolvedValue(native);
    expect(await reserveBreakoutCapacityPlan(h.tx, h.input)).toMatchObject({
      status: 'reserved',
    });
    expect(loadBreakoutPublication).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({ postId: null, nativeSourcePostId: 'native-a' }),
    );
  });

  it('checks the current source before reserving five including one quote', async () => {
    const { input, tx } = fixture();
    const result = await reserveBreakoutCapacityPlan(tx, input);
    expect(result).toMatchObject({
      status: 'reserved',
      estimate: { selectedTotalOutputs: 5, estimatedCredits: 25 },
    });
    expect(reserveBreakoutOutputPlan).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: source.organizationId,
        brandId: source.brandId,
        credentialId: source.credentialId,
        platform: source.platform,
        responseId: input.responseId,
        slots: expect.arrayContaining([
          expect.objectContaining({
            ordinal: 1,
            kind: 'quote',
            format: 'text',
            quoteExternalId: source.externalId,
          }),
        ]),
      }),
    );
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });
  it('holds exhausted capacity without writing an output plan', async () => {
    const { input, tx } = fixture();
    input.remainingPublicationSlots = 0;
    expect(await reserveBreakoutCapacityPlan(tx, input)).toMatchObject({
      status: 'capacity_held',
      estimate: { limits: ['quota_exhausted'] },
    });
    expect(reserveBreakoutOutputPlan).not.toHaveBeenCalled();
  });
  it.each([
    'contentDigest',
    'publicationFingerprint',
    'logicalPostId',
    'externalId',
    'postId',
  ] as const)('holds a changed %s', async (field) => {
    const { input, tx } = fixture();
    vi.mocked(loadBreakoutPublication).mockResolvedValue({
      ...source,
      [field]: 'changed',
    });
    expect(await reserveBreakoutCapacityPlan(tx, input)).toEqual({
      status: 'source_changed',
    });
    expect(reserveBreakoutOutputPlan).not.toHaveBeenCalled();
  });
  it('holds deleted, invalidated or response sources', async () => {
    const { input, tx } = fixture();
    vi.mocked(loadBreakoutPublication).mockResolvedValue(null);
    expect(await reserveBreakoutCapacityPlan(tx, input)).toEqual({
      status: 'source_changed',
    });
    vi.mocked(loadBreakoutPublication).mockResolvedValue({
      ...source,
      isResponse: true,
    });
    expect(await reserveBreakoutCapacityPlan(tx, input)).toEqual({
      status: 'source_changed',
    });
  });
  it('replays retained slots without expanding them or fabricating an old price', async () => {
    const { input, tx, response, findOutputs } = fixture();
    response.outputPlanFingerprint = 'existing-plan';
    input.remainingPublicationSlots = 0;
    input.budget = { ...input.budget, availableOrganizationCredits: 0 };
    vi.mocked(reserveBreakoutOutputPlan).mockResolvedValue({
      status: 'replayed',
      outputIds: ['output-a'],
      generationKeys: ['generation-a'],
    });
    expect(await reserveBreakoutCapacityPlan(tx, input)).toEqual({
      status: 'replayed',
      outputIds: ['output-a'],
      generationKeys: ['generation-a'],
      estimate: null,
    });
    expect(reserveBreakoutOutputPlan).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        slots: [{ ordinal: 1, kind: 'quote', format: 'text' }],
      }),
    );
    expect(findOutputs).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          responseId: input.responseId,
          organizationId: source.organizationId,
          brandId: source.brandId,
          credentialId: source.credentialId,
          isDeleted: false,
        },
        take: 6,
      }),
    );
  });
  it('does not repair a missing retained slot or overwrite a conflict', async () => {
    const { input, tx, response, findOutputs } = fixture();
    response.outputPlanFingerprint = 'existing-plan';
    findOutputs.mockResolvedValue([]);
    expect(await reserveBreakoutCapacityPlan(tx, input)).toEqual({
      status: 'plan_conflict',
    });
    expect(reserveBreakoutOutputPlan).not.toHaveBeenCalled();
    findOutputs.mockResolvedValue([
      { ordinal: 1, kind: 'quote', format: 'text' },
    ]);
    vi.mocked(reserveBreakoutOutputPlan).mockResolvedValue({
      status: 'plan_conflict',
    });
    expect(await reserveBreakoutCapacityPlan(tx, input)).toEqual({
      status: 'plan_conflict',
    });
  });
});
