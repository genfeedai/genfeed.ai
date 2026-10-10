import { reserveBreakoutLiveCapacityPlan } from '@api/collections/outliers/services/breakout-capacity-plan.util';
import {
  type BreakoutGenerationPlanRequest,
  BreakoutGenerationPlanService,
} from '@api/collections/outliers/services/breakout-generation-plan.service';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { ModelCategory, Platform } from '@genfeedai/contracts';
import { GENERATE_CONTENT_TEXT_CREDITS } from '@genfeedai/contracts/constants';
import type {
  BreakoutLiveCapacityReservationInput,
  BreakoutPublicationSourceV1,
} from '@genfeedai/contracts/interfaces';
import { planBreakoutCapacity } from '@genfeedai/helpers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/breakout-capacity-plan.util',
  () => ({ reserveBreakoutLiveCapacityPlan: vi.fn() }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-publication-source.util',
  () => ({ loadBreakoutPublication: vi.fn() }),
);

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
  contentDigest: 'digest-a',
  publicationFingerprint: 'publication-a',
  logicalPostId: 'logical-a',
  isResponse: false,
};
function fixture() {
  const scope = {
    organizationId: source.organizationId,
    brandId: source.brandId,
    credentialId: source.credentialId,
    platform: source.platform,
  };
  const request: BreakoutGenerationPlanRequest = {
    scope,
    responseId: 'response-a',
    strategyId: 'strategy-a',
    actorUserId: 'configuring-user',
    reauthorize: vi.fn(async () => undefined),
  };
  const row = {
    id: request.responseId,
    sourcePostId: source.postId,
    nativeSourcePostId: null,
    externalId: source.externalId,
    state: 'detected',
    logicalPostId: source.logicalPostId,
    contentDigest: source.contentDigest,
    publicationFingerprint: source.publicationFingerprint,
  };
  const prisma = {
    breakoutResponse: { findFirst: vi.fn(async () => row) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
  );
  const registry = {
    listCallableTextModels: vi.fn(async () => [
      { key: 'openai/gpt-5.2', label: 'Text' },
    ]),
    listCallableGenerationModels: vi.fn(async () => [
      { key: 'image/model', label: 'Image', type: 'image' },
    ]),
    validateModelForOrg: vi.fn(async () => ({
      key: 'image/model',
      provider: 'fal',
    })),
  };
  const router = {
    resolveModelKey: vi.fn(async () => ({
      key: 'openai/gpt-5.2',
      source: 'registry-default',
    })),
  };
  const accounts = {
    resolveDraft: vi.fn(async () => ({
      brand: { id: source.brandId },
      constraints: {
        maxWeightedCharacters: 280,
        supportsThreads: true,
        usesWeightedCharacters: true,
      },
    })),
  };
  const optimizers = { estimateAnalysisCredits: vi.fn(async () => 2) };
  const snapshots = { preview: vi.fn(async () => ({})) };
  const brandValidation = {
    preflightBrandCapabilities: vi.fn(() => ({ status: 'blocked' })),
  };
  const service = Reflect.construct(BreakoutGenerationPlanService, [
    prisma,
    registry,
    router,
    accounts,
    optimizers,
    snapshots,
    brandValidation,
  ]) as BreakoutGenerationPlanService;
  return {
    request,
    row,
    prisma,
    registry,
    router,
    accounts,
    optimizers,
    snapshots,
    brandValidation,
    service,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadBreakoutPublication).mockResolvedValue(source);
  vi.mocked(reserveBreakoutLiveCapacityPlan).mockImplementation(
    async (_tx, input: BreakoutLiveCapacityReservationInput) => {
      const estimate = planBreakoutCapacity({
        ...input,
        remainingPublicationSlots: 3,
        budget: {
          remainingDailyCredits: 100,
          remainingWeeklyCredits: 100,
          remainingMonthlyCredits: 100,
          availableOrganizationCredits: 100,
          remainingPlatformCredits: 100,
          remainingPacingCredits: 100,
          remainingFormatCredits: {},
        },
      });
      return {
        status: 'reserved',
        outputIds: estimate.slots.map((slot) => `output-${slot.ordinal}`),
        generationKeys: estimate.slots.map(
          (slot) => `generation-${slot.ordinal}`,
        ),
        estimate,
      };
    },
  );
});

describe('actual pricing and native-admitted breakout planning', () => {
  it('reserves from current server capacity with enabled routing and the normal scoring quote', async () => {
    const h = fixture();
    const result = await h.service.prepare(h.request);
    expect(result).toMatchObject({
      status: 'prepared',
      textModelKey: 'openai/gpt-5.2',
      segmentCharacterLimit: 280,
      reservation: {
        outputIds: ['output-1', 'output-2', 'output-3'],
        estimate: { selectedTotalOutputs: 3 },
      },
    });
    expect(h.prisma.breakoutResponse.findFirst).toHaveBeenCalledWith({
      where: { ...h.request.scope, id: h.request.responseId, isDeleted: false },
    });
    expect(h.registry.listCallableTextModels).toHaveBeenCalledWith('org-a');
    expect(h.router.resolveModelKey).toHaveBeenCalledWith({
      category: ModelCategory.TEXT,
      organizationId: 'org-a',
      eligibleModelKeys: ['openai/gpt-5.2'],
    });
    expect(h.optimizers.estimateAnalysisCredits).toHaveBeenCalledWith(
      {
        content: 'x'.repeat(280),
        contentType: 'caption',
        platform: 'twitter',
        goals: ['engagement', 'reach'],
      },
      expect.any(Function),
    );
    expect(reserveBreakoutLiveCapacityPlan).toHaveBeenCalledWith(
      h.prisma,
      expect.objectContaining({
        requestedTotalOutputs: 5,
        strategyId: 'strategy-a',
        costsByFormat: {
          text: {
            generationCredits: GENERATE_CONTENT_TEXT_CREDITS,
            qualityCredits: 2,
          },
          thread: {
            generationCredits: GENERATE_CONTENT_TEXT_CREDITS,
            qualityCredits: 2,
          },
        },
      }),
    );
    const input = vi.mocked(reserveBreakoutLiveCapacityPlan).mock.calls[0]?.[1];
    expect(input).not.toHaveProperty('budget');
    expect(input).not.toHaveProperty('remainingPublicationSlots');
  });
  it.each(['image', 'carousel', 'video', 'short'] as const)(
    'reserves a bounded X text quote for an unsupported %s original',
    async (format) => {
      const h = fixture();
      vi.mocked(loadBreakoutPublication).mockResolvedValueOnce({
        ...source,
        format,
      });
      expect(await h.service.prepare(h.request)).toMatchObject({
        status: 'prepared',
        reservation: {
          estimate: {
            selectedTotalOutputs: 1,
            limits: ['unsupported_format', 'quota_exhausted'],
            slots: [
              {
                kind: 'quote',
                format: 'text',
                quoteExternalId: source.externalId,
              },
            ],
          },
        },
      });
      expect(h.snapshots.preview).not.toHaveBeenCalled();
    },
  );
  it('prices the complete bounded thread rather than one segment', async () => {
    const h = fixture();
    vi.mocked(loadBreakoutPublication).mockResolvedValueOnce({
      ...source,
      format: 'thread',
    });
    expect(await h.service.prepare(h.request)).toMatchObject({
      segmentCharacterLimit: 280,
      totalCharacterLimit: 2536,
    });
    expect(h.optimizers.estimateAnalysisCredits).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'x'.repeat(2536) }),
      expect.any(Function),
    );
  });
  it('propagates native denial before private reads and revocation after the actual registry lookup', async () => {
    const h = fixture();
    vi.mocked(h.request.reauthorize).mockRejectedValueOnce(
      new Error('revoked'),
    );
    await expect(h.service.prepare(h.request)).rejects.toThrow('revoked');
    expect(h.prisma.breakoutResponse.findFirst).not.toHaveBeenCalled();
    h.registry.listCallableTextModels.mockImplementationOnce(async () => {
      vi.mocked(h.request.reauthorize).mockRejectedValueOnce(
        new Error('key narrowed'),
      );
      return [{ key: 'openai/gpt-5.2', label: 'Text' }];
    });
    await expect(h.service.prepare(h.request)).rejects.toThrow('key narrowed');
    expect(h.accounts.resolveDraft).not.toHaveBeenCalled();
    expect(reserveBreakoutLiveCapacityPlan).not.toHaveBeenCalled();
  });
  it('does not reserve after source mutation, unavailable models or incomplete quality pricing', async () => {
    const h = fixture();
    vi.mocked(loadBreakoutPublication).mockResolvedValueOnce({
      ...source,
      contentDigest: 'edited',
    });
    expect(await h.service.prepare(h.request)).toEqual({
      status: 'held',
      reason: 'source_changed',
    });
    h.registry.listCallableTextModels.mockResolvedValueOnce([]);
    expect(await h.service.prepare(h.request)).toEqual({
      status: 'held',
      reason: 'model_unavailable',
    });
    h.optimizers.estimateAnalysisCredits.mockRejectedValueOnce(
      new Error('pricing missing'),
    );
    await expect(h.service.prepare(h.request)).rejects.toThrow(
      'pricing missing',
    );
    expect(reserveBreakoutLiveCapacityPlan).not.toHaveBeenCalled();
  });
  it.each(['image', 'carousel', 'video', 'short'] as const)(
    'preserves the actual %s renderer hold on other platforms',
    async (format) => {
      const h = fixture();
      const platform = Platform.INSTAGRAM;
      const request = { ...h.request, scope: { ...h.request.scope, platform } };
      vi.mocked(loadBreakoutPublication).mockResolvedValueOnce({
        ...source,
        platform,
        format,
      });
      h.router.resolveModelKey.mockResolvedValueOnce({
        key: 'image/model',
        source: 'registry-default',
      });
      expect(await h.service.prepare(request)).toEqual({
        status: 'held',
        reason: 'media_brand_capability_unavailable',
      });
      expect(h.registry.listCallableGenerationModels).toHaveBeenCalledWith(
        'org-a',
        ['image', 'carousel'].includes(format) ? 'image' : 'video',
      );
      expect(h.router.resolveModelKey).toHaveBeenCalledWith(
        expect.objectContaining({ eligibleModelKeys: ['image/model'] }),
      );
      expect(h.snapshots.preview).toHaveBeenCalledWith({
        organizationId: 'org-a',
        brandId: 'brand-a',
        actorId: 'configuring-user',
      });
      expect(h.brandValidation.preflightBrandCapabilities).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'image/model',
          provider: 'fal',
          mediaKind: ['image', 'carousel'].includes(format) ? 'image' : 'video',
        }),
      );
      expect(h.optimizers.estimateAnalysisCredits).not.toHaveBeenCalled();
      expect(reserveBreakoutLiveCapacityPlan).not.toHaveBeenCalled();
    },
  );
});
