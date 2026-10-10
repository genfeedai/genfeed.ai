import {
  admitBreakoutGenerationContinuation,
  admitBreakoutGenerationCredits,
  type BreakoutGenerationAdmission,
  runWithBreakoutGenerationAdmission,
} from '@api/collections/outliers/services/breakout-generation-admission.util';
import { readBreakoutGrowth } from '@api/collections/outliers/services/breakout-growth.util';
import { readBreakoutLiveCapacity } from '@api/collections/outliers/services/breakout-live-capacity.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { Platform } from '@genfeedai/contracts';
import { GENERATION_POOL_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import type { BreakoutPublicationSource } from '@genfeedai/contracts/interfaces';
import type { LearningFormat } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { IReserveCreditsInput } from '@genfeedai/contracts/interfaces/billing';
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
  '@api/collections/outliers/services/breakout-publication-source.util',
  () => ({ loadBreakoutPublication: vi.fn() }),
);

const nowMs = Date.parse('2026-10-15T12:00:00Z');
function fixture(format: LearningFormat = 'text', platform = Platform.TWITTER) {
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
    workflowExecutionId: 'execution-a',
    actorUserId: 'user-a',
    componentKey: 'generation-a:caption',
    reauthorize,
  };
  const credits: IReserveCreditsInput = {
    organizationId: 'org-a',
    brandId: 'brand-a',
    actorUserId: 'user-a',
    amount: 5,
    workloadId: admission.componentKey,
    idempotencyKey: `${GENERATION_POOL_WORKLOAD_TYPE}:${admission.componentKey}`,
  };
  const response = {
    id: admission.responseId,
    state: 'planned',
    sourcePostId: 'source-a',
    nativeSourcePostId: null,
    externalId: 'external-a',
    logicalPostId: 'logical-a',
    contentDigest: 'digest-a',
    publicationFingerprint: 'publication-a',
    triggerReceiptId: 'trigger-a',
  };
  const output = {
    format,
    workflowExecutionId: admission.workflowExecutionId,
    state: 'reserved',
    ordinal: 1,
    kind: 'follow_up',
    generationKey: 'generation-a',
  };
  const source: BreakoutPublicationSource = {
    ...admission.scope,
    version: 1,
    credentialId: admission.credentialId,
    postId: 'source-a',
    externalId: response.externalId,
    logicalPostId: response.logicalPostId,
    contentDigest: response.contentDigest,
    publicationFingerprint: response.publicationFingerprint,
    publishedAt: '2026-09-01T00:00:00Z',
    isResponse: false,
  };
  const lock = vi.fn(async () => []);
  const findStrategy = vi.fn(async () => ({
    id: 'strategy-a',
    platforms: [platform],
  }));
  const findResponse = vi.fn(async () => response);
  const findOutput = vi.fn(async () => output);
  const findExecution = vi.fn(
    async (): Promise<{ id: string } | null> => ({ id: 'execution-a' }),
  );
  const tx = {
    $queryRaw: lock,
    agentStrategy: { findFirst: findStrategy },
    breakoutResponse: { findFirst: findResponse },
    breakoutResponseOutput: { findFirst: findOutput },
    workflowExecution: { findFirst: findExecution },
    breakoutBaselineReceipt: {
      findFirst: vi.fn(async () => ({ metric: 'views' })),
    },
  } as unknown as Prisma.TransactionClient;
  vi.mocked(loadBreakoutPublication).mockResolvedValue(source);
  return {
    tx,
    admission,
    credits,
    response,
    output,
    source,
    lock,
    findStrategy,
    findResponse,
    findOutput,
    findExecution,
    reauthorize,
  };
}

describe('actual breakout credit admission before the provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readBreakoutGrowth).mockResolvedValue({
      status: 'growing',
      observationIds: ['new', 'old'],
      measuredAt: new Date(nowMs).toISOString(),
      increment: 100,
      ratePerHour: 100,
      resumed: true,
    });
    vi.mocked(readBreakoutLiveCapacity).mockResolvedValue({
      status: 'available',
      capturedAt: new Date(nowMs).toISOString(),
      strategyId: 'strategy-a',
      walletVersion: 4,
      remainingPublicationSlots: 5,
      cadenceTruncated: false,
      capUsageBasis: 'monthly_ledger_and_reservations',
      budget: {
        remainingDailyCredits: 20,
        remainingWeeklyCredits: 30,
        remainingMonthlyCredits: 40,
        availableOrganizationCredits: 50,
        remainingPlatformCredits: 40,
        remainingPacingCredits: 40,
        remainingFormatCredits: {},
      },
    });
  });
  it.each<LearningFormat>([
    'text',
    'image',
    'carousel',
    'video',
    'short',
    'thread',
  ])(
    'admits an actual %s quote in the exact scoped transaction after native proof',
    async (format) => {
      const h = fixture(format);
      await admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs);
      expect(h.reauthorize).toHaveBeenCalledWith(h.tx);
      expect(h.lock).toHaveBeenCalledOnce();
      expect(h.findOutput).toHaveBeenCalledWith({
        where: {
          id: 'output-a',
          responseId: 'response-a',
          organizationId: 'org-a',
          brandId: 'brand-a',
          credentialId: 'account-a',
          isDeleted: false,
        },
      });
      expect(readBreakoutGrowth).toHaveBeenCalledWith(h.tx, {
        source: h.source,
        metric: 'views',
        nowMs,
      });
      expect(readBreakoutLiveCapacity).toHaveBeenCalledWith(h.tx, {
        ...h.admission.scope,
        credentialId: 'account-a',
        nowMs,
      });
    },
  );
  it('uses native revocation checks before reading private response/source material', async () => {
    const h = fixture();
    h.reauthorize.mockRejectedValue(new Error('key_revoked'));
    await expect(
      admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
    ).rejects.toThrow('key_revoked');
    expect(h.lock).not.toHaveBeenCalled();
    expect(loadBreakoutPublication).not.toHaveBeenCalled();
  });
  it('checks native authority around the actual attribution read before entering a provider callback', async () => {
    const h = fixture();
    const revoked = new Error('key_revoked_during_attribution');
    const generate = vi.fn(async () => 'provider-result');
    h.reauthorize.mockRejectedValueOnce(revoked);
    await expect(
      runWithBreakoutGenerationAdmission(h.tx, h.admission, generate),
    ).rejects.toBe(revoked);
    expect(h.findStrategy).not.toHaveBeenCalled();
    h.findStrategy.mockImplementationOnce(async () => {
      h.reauthorize.mockRejectedValueOnce(revoked);
      return { id: 'strategy-a', platforms: [Platform.TWITTER] };
    });
    await expect(
      runWithBreakoutGenerationAdmission(h.tx, h.admission, generate),
    ).rejects.toBe(revoked);
    expect(generate).not.toHaveBeenCalled();
  });
  it.each(['lock', 'response', 'output', 'execution'] as const)(
    'propagates revocation after the %s await before later private reads or billing continuation',
    async (stage) => {
      const h = fixture();
      const revoked = new Error(`key_revoked_during_${stage}`);
      const rejectNext = () => h.reauthorize.mockRejectedValueOnce(revoked);
      switch (stage) {
        case 'lock':
          h.lock.mockImplementationOnce(async () => {
            rejectNext();
            return [];
          });
          break;
        case 'response':
          h.findResponse.mockImplementationOnce(async () => {
            rejectNext();
            return h.response;
          });
          break;
        case 'output':
          h.findOutput.mockImplementationOnce(async () => {
            rejectNext();
            return h.output;
          });
          break;
        case 'execution':
          h.findExecution.mockImplementationOnce(async () => {
            rejectNext();
            return { id: 'execution-a' };
          });
          break;
      }
      await expect(
        admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
      ).rejects.toBe(revoked);
      expect(loadBreakoutPublication).not.toHaveBeenCalled();
      expect(readBreakoutLiveCapacity).not.toHaveBeenCalled();
    },
  );
  it.each(['source', 'growth', 'capacity'] as const)(
    'propagates native revocation after actual %s evidence for paid and zero-credit continuations',
    async (stage) => {
      for (const requiredCredits of [0, 5]) {
        const h = fixture();
        const revoked = new Error(`key_revoked_during_${stage}`);
        if (stage === 'source') {
          vi.mocked(loadBreakoutPublication).mockImplementationOnce(
            async () => {
              h.reauthorize.mockRejectedValueOnce(revoked);
              return h.source;
            },
          );
        } else if (stage === 'growth') {
          vi.mocked(readBreakoutGrowth).mockImplementationOnce(async () => {
            h.reauthorize.mockRejectedValueOnce(revoked);
            return { status: 'held', reason: 'growth_evidence_stale' };
          });
        } else {
          vi.mocked(readBreakoutLiveCapacity).mockImplementationOnce(
            async () => {
              h.reauthorize.mockRejectedValueOnce(revoked);
              return { status: 'held', reason: 'missing_strategy' };
            },
          );
        }
        await expect(
          admitBreakoutGenerationContinuation(
            h.tx,
            h.admission,
            requiredCredits,
            nowMs,
          ),
        ).rejects.toBe(revoked);
      }
    },
  );
  it.each([
    'organizationId',
    'brandId',
    'actorUserId',
    'workloadId',
    'idempotencyKey',
  ] as const)('denies a changed %s before private reads', async (field) => {
    const h = fixture();
    h.credits[field] = 'foreign';
    await expect(
      admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
    ).rejects.toThrow('credit_scope_changed');
    expect(h.reauthorize).not.toHaveBeenCalled();
  });
  it('does not mint a fresh paid attempt for the normal endpoint released-hold retry suffix', async () => {
    const h = fixture();
    h.credits.idempotencyKey += ':retry:random';
    await expect(
      admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
    ).rejects.toThrow('credit_scope_changed');
  });
  it('denies another workflow execution or a released/suppressed output', async () => {
    const h = fixture();
    h.output.workflowExecutionId = 'another-execution';
    await expect(
      admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
    ).rejects.toThrow('output_execution_changed');
    h.output.workflowExecutionId = h.admission.workflowExecutionId;
    h.output.state = 'suppressed';
    await expect(
      admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
    ).rejects.toThrow('output_execution_changed');
  });
  it('denies a vanished execution and never adopts a creator as its initiator', async () => {
    const h = fixture();
    h.findExecution.mockResolvedValue(null);
    await expect(
      admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
    ).rejects.toThrow('execution_unavailable');
    expect(loadBreakoutPublication).not.toHaveBeenCalled();
  });
  it('holds changed source material and faded growth without new funds', async () => {
    const h = fixture();
    h.source.contentDigest = 'edited';
    await expect(
      admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
    ).rejects.toThrow('source_changed');
    h.source.contentDigest = h.response.contentDigest;
    vi.mocked(readBreakoutGrowth).mockResolvedValue({
      status: 'held',
      reason: 'growth_faded',
    });
    await expect(
      admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
    ).rejects.toThrow('growth_faded');
  });
  it('only authorizes the first X text quote and keeps other follow-ups in the source format', async () => {
    const h = fixture();
    h.output.kind = 'quote';
    await admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs);
    h.output.ordinal = 2;
    await expect(
      admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
    ).rejects.toThrow('output_plan_changed');
    const other = fixture('text', Platform.LINKEDIN);
    other.output.kind = 'quote';
    await expect(
      admitBreakoutGenerationCredits(
        other.tx,
        other.admission,
        other.credits,
        nowMs,
      ),
    ).rejects.toThrow('output_plan_changed');
  });
  it.each([
    'remainingDailyCredits',
    'remainingWeeklyCredits',
    'remainingMonthlyCredits',
    'availableOrganizationCredits',
    'remainingPlatformCredits',
    'remainingPacingCredits',
  ] as const)('holds an actual price exceeding %s', async (field) => {
    const h = fixture();
    const capacity = await readBreakoutLiveCapacity(h.tx, {
      ...h.admission.scope,
      credentialId: 'account-a',
      nowMs,
    });
    if (capacity.status !== 'available') throw new Error('fixture');
    capacity.budget[field] = 4;
    await expect(
      admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
    ).rejects.toThrow('budget_exhausted');
  });
  it('holds unreadable format capacity and exhausted publication quota', async () => {
    const h = fixture('video');
    const capacity = await readBreakoutLiveCapacity(h.tx, {
      ...h.admission.scope,
      credentialId: 'account-a',
      nowMs,
    });
    if (capacity.status !== 'available') throw new Error('fixture');
    capacity.budget.remainingFormatCredits.video = null;
    await expect(
      admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
    ).rejects.toThrow('budget_unavailable');
    delete capacity.budget.remainingFormatCredits.video;
    capacity.remainingPublicationSlots = 0;
    await expect(
      admitBreakoutGenerationCredits(h.tx, h.admission, h.credits, nowMs),
    ).rejects.toThrow('quota_exhausted');
  });
});
