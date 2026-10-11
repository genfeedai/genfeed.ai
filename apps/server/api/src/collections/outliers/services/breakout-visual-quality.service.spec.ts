import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { BreakoutGenerationAdmission } from '@api/collections/outliers/services/breakout-generation-admission.util';
import {
  type BreakoutVisualPart,
  BreakoutVisualQualityService,
} from '@api/collections/outliers/services/breakout-visual-quality.service';
import {
  BREAKOUT_VISUAL_QUALITY_KEY,
  type BreakoutQualityBinding,
} from '@api/collections/outliers/services/breakout-visual-quality.util';
import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditReservationStatus, Platform } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
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

const binding: BreakoutQualityBinding = {
  responseId: 'response-a',
  outputId: 'output-a',
  postId: 'post-a',
  strategyId: 'strategy-a',
  workflowExecutionId: 'execution-a',
  materialHash: 'sha256:material',
};

function fixture(model = { pricingType: 'flat', cost: 3 }) {
  const reauthorize = vi.fn(async (_tx: Prisma.TransactionClient) => undefined);
  const admission: BreakoutGenerationAdmission = {
    scope: {
      version: 1,
      organizationId: 'org-a',
      brandId: 'brand-a',
      strategyId: 'strategy-a',
      platform: Platform.INSTAGRAM,
      format: 'carousel',
    },
    credentialId: 'account-a',
    responseId: 'response-a',
    outputId: 'output-a',
    actorUserId: 'actor-a',
    workflowExecutionId: 'execution-a',
    componentKey: 'generation-a:caption',
    reauthorize,
  };
  const scores: Array<{ id: string; data: Record<string, unknown> }> = [];
  const tx = {
    contentScore: {
      findMany: vi.fn(async () => scores),
      create: vi.fn(
        async ({ data }: { data: { data: Record<string, unknown> } }) => {
          scores.push({ id: `score-${scores.length}`, data: data.data });
          return {};
        },
      ),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(
      async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) =>
        run(tx as unknown as Prisma.TransactionClient),
    ),
  };
  const evaluations = {
    evaluateImage: vi.fn(
      async (
        _url: string,
        _context: unknown,
        _org: string,
        onBilling?: (amount: number) => void,
      ) => {
        onBilling?.(2);
        return { overallScore: 88 };
      },
    ),
    evaluateVideo: vi.fn(
      async (
        _url: string,
        _context: unknown,
        _org: string,
        onBilling?: (amount: number) => void,
      ) => {
        onBilling?.(2);
        return { overallScore: 81 };
      },
    ),
  };
  const models = { findOne: vi.fn(async () => model) };
  const platformSettings = {
    getFeatureSettings: vi.fn(async () => ({ generationMaxTokens: 1000 })),
  };
  const credits = {
    reserveCredits: vi.fn(async () => ({
      id: 'hold-visual',
      status: CreditReservationStatus.RESERVED,
    })),
    settleReservation: vi.fn(async () => undefined),
    findReservationForWorkload: vi.fn(
      async (): Promise<{ id: string } | null> => null,
    ),
  };
  const service = new BreakoutVisualQualityService(
    prisma as unknown as PrismaService,
    evaluations as unknown as EvaluationsOperationsService,
    models as unknown as ModelsService,
    platformSettings as unknown as PlatformSettingsService,
    credits as unknown as CreditsUtilsService,
  );
  const parts: BreakoutVisualPart[] = [
    { url: 'https://cdn.test/a', mediaKind: 'image', durationSeconds: null },
    { url: 'https://cdn.test/b', mediaKind: 'image', durationSeconds: null },
  ];
  const request = {
    admission,
    binding,
    generationKey: 'generation-a',
    caption: 'A caption',
    parts,
    maximumCredits: 50,
  };
  return {
    service,
    request,
    admission,
    reauthorize,
    scores,
    tx,
    evaluations,
    models,
    credits,
  };
}

describe('visual quality evaluation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prices a flat model at its flat cost and a token model from the bounded request', async () => {
    const flat = fixture();
    expect(
      await flat.service.estimateCredits('image', async () => undefined),
    ).toBe(3);
    const tokens = fixture({
      pricingType: 'per-token',
      inputCostPerMillionTokens: 1_000_000,
      outputCostPerMillionTokens: 1_000_000,
    } as never);
    // 16,000 prompt characters + one reference, plus 4 characters per bounded output token.
    expect(
      await tokens.service.estimateCredits('image', async () => undefined),
    ).toBeGreaterThan(4000);
    expect(
      await tokens.service.estimateCredits('video', async () => undefined),
    ).toBeGreaterThan(
      await tokens.service.estimateCredits('image', async () => undefined),
    );
  });

  it('holds an unknown evaluation price instead of guessing one', async () => {
    const h = fixture();
    h.models.findOne.mockResolvedValueOnce(null as never);
    await expect(
      h.service.estimateCredits('image', async () => undefined),
    ).rejects.toThrow('breakout_visual_quality_price_unavailable');
  });

  it('reserves, judges and settles every visual as its own deterministic component', async () => {
    const h = fixture();
    await h.service.evaluate(h.request);
    expect(h.credits.reserveCredits).toHaveBeenCalledTimes(2);
    expect(h.credits.reserveCredits).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        amount: 3,
        actorUserId: 'actor-a',
        brandId: 'brand-a',
        workloadId: 'generation-a:quality:visual:1',
        idempotencyKey: 'generation:generation-a:quality:visual:1',
      }),
    );
    expect(h.credits.reserveCredits).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ workloadId: 'generation-a:quality:visual:2' }),
    );
    expect(h.credits.settleReservation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        reservationId: 'hold-visual',
        actualAmount: 2,
        settlementIdempotencyKey: 'generation-a:quality:visual:1:settled',
      }),
    );
    expect(h.evaluations.evaluateImage).toHaveBeenCalledWith(
      'https://cdn.test/a',
      { prompt: 'A caption', platform: 'instagram' },
      'org-a',
      expect.any(Function),
    );
    expect(h.scores.map((row) => row.data)).toEqual([
      expect.objectContaining({
        [BREAKOUT_VISUAL_QUALITY_KEY]: { ...binding, partIndex: 0 },
        overallScore: 88,
      }),
      expect.objectContaining({
        [BREAKOUT_VISUAL_QUALITY_KEY]: { ...binding, partIndex: 1 },
      }),
    ]);
  });

  it('judges a video from its frames with the planned length', async () => {
    const h = fixture();
    h.request.parts = [
      { url: 'https://cdn.test/v', mediaKind: 'video', durationSeconds: 10 },
    ];
    await h.service.evaluate(h.request);
    expect(h.evaluations.evaluateImage).not.toHaveBeenCalled();
    expect(h.evaluations.evaluateVideo).toHaveBeenCalledWith(
      'https://cdn.test/v',
      { prompt: 'A caption', platform: 'instagram', durationSeconds: 10 },
      'org-a',
      expect.any(Function),
    );
  });

  it('skips a visual that already has retained evidence and never repeats its paid call', async () => {
    const h = fixture();
    h.scores.push({
      id: 'score-existing',
      data: {
        [BREAKOUT_VISUAL_QUALITY_KEY]: { ...binding, partIndex: 0 },
        overallScore: 90,
      },
    });
    await h.service.evaluate(h.request);
    expect(h.evaluations.evaluateImage).toHaveBeenCalledTimes(1);
    expect(h.evaluations.evaluateImage).toHaveBeenCalledWith(
      'https://cdn.test/b',
      expect.anything(),
      'org-a',
      expect.any(Function),
    );
  });

  it('refuses a component that already holds credits: an earlier attempt ran', async () => {
    const h = fixture();
    h.credits.findReservationForWorkload.mockResolvedValueOnce({ id: 'old' });
    await expect(h.service.evaluate(h.request)).rejects.toThrow(
      'breakout_quality_paid_retry_held',
    );
    expect(h.credits.reserveCredits).not.toHaveBeenCalled();
    expect(h.evaluations.evaluateImage).not.toHaveBeenCalled();
  });

  it('refuses a price above the remaining budget before reserving', async () => {
    const h = fixture();
    h.request.maximumCredits = 2;
    await expect(h.service.evaluate(h.request)).rejects.toThrow(
      'breakout_quality_budget_unavailable',
    );
    expect(h.credits.reserveCredits).not.toHaveBeenCalled();
  });

  it('does not judge when the hold is not dispatchable', async () => {
    const h = fixture();
    h.credits.reserveCredits.mockResolvedValueOnce({
      id: 'hold-visual',
      status: CreditReservationStatus.RELEASED,
    });
    await expect(h.service.evaluate(h.request)).rejects.toThrow(
      'breakout_quality_hold_not_dispatchable',
    );
    expect(h.evaluations.evaluateImage).not.toHaveBeenCalled();
  });

  it('keeps the hold and records nothing when the judge fails', async () => {
    const h = fixture();
    h.evaluations.evaluateImage.mockRejectedValueOnce(
      new Error('provider down'),
    );
    await expect(h.service.evaluate(h.request)).rejects.toThrow(
      'provider down',
    );
    expect(h.credits.settleReservation).not.toHaveBeenCalled();
    expect(h.scores).toHaveLength(0);
  });

  it('flags a charge above its hold for reconciliation and records no score', async () => {
    const h = fixture();
    h.evaluations.evaluateImage.mockImplementationOnce(
      async (_url, _context, _org, onBilling) => {
        onBilling?.(99);
        return { overallScore: 80 };
      },
    );
    await expect(h.service.evaluate(h.request)).rejects.toThrow(
      'breakout_quality_charge_needs_reconciliation',
    );
    expect(h.credits.settleReservation).not.toHaveBeenCalled();
    expect(h.scores).toHaveLength(0);
  });

  it('settles the whole hold when the judge reports no charge, and rejects an unusable score', async () => {
    const h = fixture();
    h.evaluations.evaluateImage.mockImplementationOnce(async () => ({
      overallScore: 80,
    }));
    await h.service.evaluate({
      ...h.request,
      parts: h.request.parts.slice(0, 1),
    });
    expect(h.credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 3 }),
    );
    const bad = fixture();
    bad.evaluations.evaluateImage.mockImplementationOnce(
      async (_u, _c, _o, b) => {
        b?.(1);
        return { overallScore: 'high' as unknown as number };
      },
    );
    await expect(bad.service.evaluate(bad.request)).rejects.toThrow(
      'breakout_quality_policy_unavailable',
    );
    expect(bad.scores).toHaveLength(0);
  });
});
