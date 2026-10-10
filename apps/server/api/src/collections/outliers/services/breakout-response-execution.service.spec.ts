import type { BreakoutGenerationPlanResult } from '@api/collections/outliers/services/breakout-generation-plan.service';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import {
  type BreakoutResponseExecutionRequest,
  BreakoutResponseExecutionService,
} from '@api/collections/outliers/services/breakout-response-execution.service';
import type { BreakoutTextOutputPreparationRequest } from '@api/collections/outliers/services/breakout-text-output-preparation.service';
import { Platform } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/breakout-output-recovery.util',
  () => ({ readBreakoutOutputRecovery: vi.fn() }),
);
function fixture() {
  const scope = {
    organizationId: 'org-a',
    brandId: 'brand-a',
    credentialId: 'credential-a',
    platform: Platform.TWITTER,
  };
  const request: BreakoutResponseExecutionRequest = {
    scope,
    responseId: 'response-a',
    strategyId: 'strategy-a',
    actorUserId: 'configuring-user',
    workflowExecutionId: 'execution-a',
    reauthorize: vi.fn(async () => undefined),
  };
  const rows = Array.from({ length: 5 }, (_, index) => ({
    id: `output-${index + 1}`,
    generationKey: `generation-${index + 1}`,
    ordinal: index + 1,
    format: 'text',
    state: 'reserved',
    heldReason: null as string | null,
    workflowExecutionId: null as string | null,
  }));
  const first = rows[0];
  if (!first) throw new Error('Missing output fixture');
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(async () => []),
    breakoutResponse: {
      findFirst: vi.fn(async () => ({
        outputPlanFingerprint: 'immutable-plan',
      })),
    },
    workflowExecution: {
      findFirst: vi.fn(async () => ({ id: request.workflowExecutionId })),
    },
    breakoutResponseOutput: {
      findFirst: vi.fn(
        async (input: Prisma.BreakoutResponseOutputFindFirstArgs) =>
          rows.find((row) => row.id === input.where?.id) ?? null,
      ),
      updateMany: vi.fn(
        async (input: Prisma.BreakoutResponseOutputUpdateManyArgs) => {
          const row = rows.find((value) => value.id === input.where?.id);
          if (
            !row ||
            row.workflowExecutionId !== null ||
            row.state !== 'reserved'
          )
            return { count: 0 };
          row.workflowExecutionId = request.workflowExecutionId;
          return { count: 1 };
        },
      ),
    },
  };
  prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
  );
  const planner = {
    prepare: vi.fn(
      async (): Promise<BreakoutGenerationPlanResult> => ({
        status: 'prepared',
        source: {
          version: 1,
          ...scope,
          postId: 'original-a',
          externalId: 'tweet-a',
          format: 'text',
          publishedAt: '2026-10-08T12:00:00.000Z',
          contentDigest: 'digest-a',
          publicationFingerprint: 'publication-a',
          logicalPostId: 'logical-a',
          isResponse: false,
        },
        textModelKey: 'openai/gpt-5.2',
        segmentCharacterLimit: 280,
        totalCharacterLimit: 280,
        reservation: {
          status: 'reserved',
          outputIds: rows.map((row) => row.id),
          generationKeys: rows.map((row) => row.generationKey),
          estimate: null,
        },
      }),
    ),
  };
  const text = {
    generate: vi.fn(async (input: BreakoutTextOutputPreparationRequest) => {
      const row = rows.find((value) => value.id === input.admission.outputId);
      if (row) row.state = 'generating';
      return {
        kind: 'completed' as 'completed' | 'stopped' | 'in_progress',
        reasonCode: 'provider_attempt_ref_unavailable',
      };
    }),
  };
  const service = Reflect.construct(BreakoutResponseExecutionService, [
    prisma,
    planner,
    text,
  ]) as BreakoutResponseExecutionService;
  return { request, rows, first, prisma, planner, text, service };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readBreakoutOutputRecovery).mockImplementation(
    async (_tx, input) => ({
      status: 'available',
      responseId: input.responseId,
      outputId: input.outputId,
      state: 'draft',
      reason: 'publication_admission_required',
      action: 'use_existing_artifact',
      mayRepeatPaidRequest: false,
      postId: 'draft-a',
      externalId: null,
    }),
  );
});
describe('bounded actual breakout response execution', () => {
  it('binds five immutable outputs to the actual original-user execution and calls the concrete preparer', async () => {
    const h = fixture();
    expect(await h.service.execute(h.request)).toMatchObject({
      status: 'completed',
      responseId: 'response-a',
      outputs: h.rows.map((row) => ({
        outputId: row.id,
        recovery: { state: 'draft', mayRepeatPaidRequest: false },
      })),
    });
    expect(h.text.generate).toHaveBeenCalledTimes(5);
    expect(
      h.rows.every((row) => row.workflowExecutionId === 'execution-a'),
    ).toBe(true);
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(h.prisma.workflowExecution.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'execution-a',
        organizationId: 'org-a',
        userId: 'configuring-user',
        isDeleted: false,
        status: { in: ['PENDING', 'RUNNING'] },
      },
      select: { id: true },
    });
    expect(h.text.generate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        textModelKey: 'openai/gpt-5.2',
        admission: expect.objectContaining({
          actorUserId: 'configuring-user',
          workflowExecutionId: 'execution-a',
          outputId: 'output-1',
          componentKey: 'generation-1:caption',
          reauthorize: h.request.reauthorize,
        }),
      }),
    );
  });
  it('returns retained artifacts on the same execution without another generator call', async () => {
    const h = fixture();
    await h.service.execute(h.request);
    h.text.generate.mockClear();
    h.prisma.breakoutResponseOutput.updateMany.mockClear();
    expect(await h.service.execute(h.request)).toMatchObject({
      status: 'completed',
    });
    expect(h.text.generate).not.toHaveBeenCalled();
    expect(h.prisma.breakoutResponseOutput.updateMany).not.toHaveBeenCalled();
  });
  it('does not replace another execution or dispatch after losing the binding CAS', async () => {
    const h = fixture();
    h.first.workflowExecutionId = 'original-execution';
    await expect(h.service.execute(h.request)).rejects.toThrow(
      'breakout_execution_binding_conflict',
    );
    expect(h.text.generate).not.toHaveBeenCalled();
    expect(h.prisma.breakoutResponseOutput.updateMany).not.toHaveBeenCalled();
    h.first.workflowExecutionId = null;
    h.prisma.breakoutResponseOutput.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    await expect(h.service.execute(h.request)).rejects.toThrow(
      'breakout_execution_binding_conflict',
    );
    expect(h.text.generate).not.toHaveBeenCalled();
  });
  it('denies before planning and after an execution lookup revokes the current key', async () => {
    const h = fixture();
    vi.mocked(h.request.reauthorize).mockRejectedValueOnce(
      new Error('revoked'),
    );
    await expect(h.service.execute(h.request)).rejects.toThrow('revoked');
    expect(h.planner.prepare).not.toHaveBeenCalled();
    h.prisma.workflowExecution.findFirst.mockImplementationOnce(async () => {
      vi.mocked(h.request.reauthorize).mockRejectedValueOnce(
        new Error('key narrowed'),
      );
      return { id: 'execution-a' };
    });
    await expect(h.service.execute(h.request)).rejects.toThrow('key narrowed');
    expect(h.prisma.breakoutResponseOutput.updateMany).not.toHaveBeenCalled();
    expect(h.text.generate).not.toHaveBeenCalled();
  });
  it.each(['stopped', 'in_progress'] as const)(
    'stops siblings after an actual %s outcome',
    async (kind) => {
      const h = fixture();
      h.text.generate.mockResolvedValueOnce({
        kind,
        reasonCode: 'provider_attempt_ref_unavailable',
      });
      expect(await h.service.execute(h.request)).toMatchObject({
        status: kind === 'stopped' ? 'held' : 'processing',
        outputs: [{ outputId: 'output-1' }],
      });
      expect(h.text.generate).toHaveBeenCalledOnce();
      expect(h.rows[1]?.workflowExecutionId).toBeNull();
    },
  );
  it('retains an unresolved quality/provider hold without paid replay or sibling work', async () => {
    const h = fixture();
    h.first.state = 'generating';
    h.first.workflowExecutionId = 'execution-a';
    h.first.heldReason = 'quality_evaluation_pending';
    vi.mocked(readBreakoutOutputRecovery).mockResolvedValueOnce({
      status: 'available',
      responseId: 'response-a',
      outputId: 'output-1',
      state: 'reconciliation_required',
      reason: 'quality_evaluation_pending',
      action: 'reconcile',
      mayRepeatPaidRequest: false,
      postId: 'draft-a',
      externalId: null,
    });
    expect(await h.service.execute(h.request)).toMatchObject({
      status: 'processing',
      reason: 'quality_evaluation_pending',
    });
    expect(h.text.generate).not.toHaveBeenCalled();
    expect(h.rows[1]?.workflowExecutionId).toBeNull();
  });
  it('holds unavailable current growth/capacity before binding or generating', async () => {
    const h = fixture();
    h.planner.prepare.mockResolvedValueOnce({
      status: 'held',
      reason: 'growth_faded',
    });
    expect(await h.service.execute(h.request)).toEqual({
      status: 'held',
      responseId: 'response-a',
      reason: 'growth_faded',
      outputs: [],
    });
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.text.generate).not.toHaveBeenCalled();
  });
});
