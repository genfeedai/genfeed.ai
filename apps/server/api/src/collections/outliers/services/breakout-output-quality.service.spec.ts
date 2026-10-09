import type { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import type { BreakoutGenerationAdmission } from '@api/collections/outliers/services/breakout-generation-admission.util';
import { BreakoutOutputQualityService } from '@api/collections/outliers/services/breakout-output-quality.service';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
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
vi.mock(
  '@api/collections/outliers/services/breakout-live-capacity.util',
  () => ({
    readBreakoutLiveCapacity: vi.fn(async () => ({
      status: 'available',
      budget: {
        remainingDailyCredits: 20,
        remainingWeeklyCredits: 20,
        remainingMonthlyCredits: 20,
        remainingPlatformCredits: 20,
        remainingPacingCredits: 20,
        availableOrganizationCredits: 20,
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
vi.mock(
  '@api/services/branded-generation-receipts/branded-generation-post-material.util',
  () => ({
    brandedPostMaterialSelect: { id: true },
    describeBrandedPostMaterialLayout: (
      _scope: unknown,
      post: { description: string; thread: boolean },
    ) => ({
      format: post.thread ? 'thread' : 'text',
      textBytes: Buffer.from(post.description),
      entries: post.thread
        ? [
            {
              kind: 'text',
              bytes: Buffer.from('Second segment: reply with your experience.'),
            },
          ]
        : [],
    }),
  }),
);

function fixture(thread = false) {
  const reauthorize = vi.fn(async (_tx: Prisma.TransactionClient) => undefined);
  const admission: BreakoutGenerationAdmission = {
    scope: {
      version: 1,
      organizationId: 'org-a',
      brandId: 'brand-a',
      strategyId: 'strategy-a',
      platform: Platform.TWITTER,
      format: thread ? 'thread' : 'text',
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
    description: 'One useful point: reply with your experience.',
    thread,
  };
  const strategy = {
    id: 'strategy-a',
    isActive: true,
    isEnabled: true,
    brandId: 'brand-a',
    goalProfile: 'reach_traffic',
    publishPolicy: { minPostScore: 70 },
  };
  let heldReason: string | null = null;
  let state = 'reserved';
  let score: { id: string; data: Prisma.JsonValue } | null = null;
  const tx = {
    $queryRaw: vi.fn(async () => []),
    post: { findFirst: vi.fn(async () => post) },
    agentStrategy: {
      findFirst: vi.fn(async () => ({
        config: {
          isEnabled: strategy.isEnabled,
          goalProfile: strategy.goalProfile,
        },
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
        if (
          score &&
          expected &&
          'equals' in expected &&
          JSON.stringify(
            (score.data as { breakoutQuality: unknown }).breakoutQuality,
          ) === JSON.stringify(expected.equals)
        )
          return score;
        return null;
      }),
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
    reserveCredits: vi.fn(async () => ({
      id: 'hold-quality',
      status: CreditReservationStatus.RESERVED,
    })),
    settleReservation: vi.fn(async () => undefined),
    releaseReservation: vi.fn(),
  };
  let scoreValue = 90;
  let outcome: 'normal' | 'unknown' | 'repair' = 'normal';
  const dispatch = vi.fn();
  const optimizers = {
    analyzeContent: vi.fn<OptimizersService['analyzeContent']>(
      async (dto, _org, _actor, _billing, _cap, continuation) => {
        if (!continuation)
          throw new Error('trusted quality continuation required');
        await continuation.reauthorize();
        await continuation.beforeAttempt(2);
        dispatch();
        if (outcome === 'unknown') throw new Error('provider outcome unknown');
        await continuation.acceptedAttempt(2);
        if (outcome === 'repair') await continuation.beforeAttempt(2);
        await continuation.reauthorize();
        score = {
          id: 'score-a',
          data: {
            content: dto.content,
            overallScore: scoreValue,
            metadata: { hasCallToAction: true },
            breakoutQuality: { ...continuation.scoreBinding },
          },
        };
        return { ...score };
      },
    ),
  };
  const service = new BreakoutOutputQualityService(
    prisma as unknown as PrismaService,
    strategies as unknown as AgentStrategiesService,
    optimizers as unknown as OptimizersService,
    credits as unknown as CreditsUtilsService,
  );
  return {
    service,
    request: { admission, postId: post.id },
    tx,
    post,
    strategy,
    reauthorize,
    credits,
    dispatch,
    optimizers,
    setScore: (value: number) => {
      scoreValue = value;
    },
    setOutcome: (value: typeof outcome) => {
      outcome = value;
    },
    setHold: (value: CreditReservationStatus) => {
      credits.reserveCredits.mockResolvedValue({
        id: 'hold-quality',
        status: value,
      });
    },
    state: () => ({ heldReason, state }),
  };
}

describe('breakout normal strategy quality consumer', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([false, true])(
    'scores complete canonical content, settles the actual cost and replays without another paid call (thread=%s)',
    async (thread) => {
      const h = fixture(thread);
      expect(await h.service.evaluate(h.request)).toEqual({
        state: 'approved',
        scoreId: 'score-a',
      });
      expect(h.credits.reserveCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2,
          actorUserId: 'actor-a',
          brandId: 'brand-a',
          workloadId: 'generation-a:quality',
          idempotencyKey: 'generation:generation-a:quality',
        }),
      );
      expect(h.credits.settleReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: 'hold-quality',
          actualAmount: 2,
        }),
      );
      const content = h.optimizers.analyzeContent.mock.calls[0]?.[0].content;
      expect(content).toBe(
        thread
          ? `${h.post.description}\n\nSecond segment: reply with your experience.`
          : h.post.description,
      );
      expect(await h.service.evaluate(h.request)).toEqual({
        state: 'approved',
        scoreId: 'score-a',
      });
      expect(h.dispatch).toHaveBeenCalledOnce();
    },
  );
  it('holds a low score, then rechecks a raised current threshold without resampling', async () => {
    const h = fixture();
    h.setScore(60);
    expect(await h.service.evaluate(h.request)).toEqual({
      state: 'held',
      scoreId: 'score-a',
    });
    expect(h.state()).toEqual({
      heldReason: 'platform_quality_blocked',
      state: 'awaiting_review',
    });
    h.strategy.publishPolicy.minPostScore = 95;
    expect(await h.service.evaluate(h.request)).toEqual({
      state: 'held',
      scoreId: 'score-a',
    });
    expect(h.dispatch).toHaveBeenCalledOnce();
  });
  it.each(['unknown', 'repair'] as const)(
    'retains %s outcomes without blind paid retries or releasing holds',
    async (outcome) => {
      const h = fixture();
      h.setOutcome(outcome);
      await expect(h.service.evaluate(h.request)).rejects.toThrow();
      expect(await h.service.evaluate(h.request)).toEqual({
        state: 'reconciliation_required',
        scoreId: null,
      });
      expect(h.dispatch).toHaveBeenCalledOnce();
      expect(h.credits.releaseReservation).not.toHaveBeenCalled();
      expect(h.credits.settleReservation).toHaveBeenCalledTimes(
        outcome === 'repair' ? 1 : 0,
      );
    },
  );
  it('does not score an edited completed draft or reuse its previous approval', async () => {
    const h = fixture();
    await h.service.evaluate(h.request);
    h.post.description = 'Edited material';
    // The retained normal brand receipt would fail complete material matching before this adapter claim.
    vi.mocked(readBreakoutOutputRecovery).mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'scope_mismatch',
    });
    await expect(h.service.evaluate(h.request)).rejects.toThrow(
      'artifact_unavailable',
    );
    expect(h.dispatch).toHaveBeenCalledOnce();
  });
  it('denies native access before private draft, score or policy reads', async () => {
    const h = fixture();
    h.reauthorize.mockRejectedValueOnce(new Error('key revoked'));
    await expect(h.service.evaluate(h.request)).rejects.toThrow('key revoked');
    expect(h.tx.post.findFirst).not.toHaveBeenCalled();
    expect(h.tx.contentScore.findFirst).not.toHaveBeenCalled();
    expect(h.dispatch).not.toHaveBeenCalled();
  });
  it('refuses a terminal credit hold before the optimizer can dispatch', async () => {
    const h = fixture();
    h.setHold(CreditReservationStatus.SETTLED);
    await expect(h.service.evaluate(h.request)).rejects.toThrow(
      'hold_not_dispatchable',
    );
    expect(h.dispatch).not.toHaveBeenCalled();
  });
});
