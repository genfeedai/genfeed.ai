import { strategyBudgetAttributionSchema } from '@api/collections/credits/services/strategy-budget-attribution.context';
import type { BreakoutGenerationPlanResult } from '@api/collections/outliers/services/breakout-generation-plan.service';
import type { BreakoutMediaOutputPreparationRequest } from '@api/collections/outliers/services/breakout-media-output-preparation.service';
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
function fixture(
  formats: string[] = ['text', 'text', 'text', 'text', 'text'],
  platform: Platform = Platform.TWITTER,
) {
  const scope = {
    organizationId: 'org-a',
    brandId: 'brand-a',
    credentialId: 'credential-a',
    platform,
  };
  const request: BreakoutResponseExecutionRequest = {
    scope,
    responseId: 'response-a',
    strategyId: 'strategy-a',
    actorUserId: 'configuring-user',
    workflowExecutionId: 'execution-a',
    reauthorize: vi.fn(async () => undefined),
  };
  const rows = formats.map((format, index) => ({
    id: `output-${index + 1}`,
    generationKey: `generation-${index + 1}`,
    ordinal: index + 1,
    format,
    state: 'reserved',
    heldReason: null as string | null,
    workflowExecutionId: null as string | null,
  }));
  const first = rows[0];
  if (!first) throw new Error('Missing output fixture');
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(async () => []),
    organizationSetting: {
      findFirst: vi.fn(async () => ({
        isBrandVisionChecksEnabled: false,
        isBreakoutAutoPublishEnabled: false,
        isBreakoutResponsesEnabled: true,
      })),
    },
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
        mediaModelKey: formats.some((format) => format !== 'text')
          ? 'media/model'
          : null,
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
  const media = {
    generate: vi.fn(async (input: BreakoutMediaOutputPreparationRequest) => {
      const row = rows.find((value) => value.id === input.admission.outputId);
      if (row) row.state = 'generating';
      return {
        kind: 'completed' as 'completed' | 'stopped' | 'in_progress',
        reasonCode: 'artifact_source_changed',
        postId: 'composed-a',
      };
    }),
  };
  const autoPublish = {
    schedule: vi.fn(
      async (
        _input: unknown,
      ): Promise<
        | { status: 'scheduled'; postId: string }
        | { status: 'review_only'; reason: string }
      > => ({ status: 'review_only', reason: 'org_auto_publish_disabled' }),
    ),
  };
  const service = Reflect.construct(BreakoutResponseExecutionService, [
    prisma,
    planner,
    text,
    media,
    autoPublish,
  ]) as BreakoutResponseExecutionService;
  return {
    autoPublish,
    request,
    rows,
    first,
    prisma,
    planner,
    text,
    media,
    service,
  };
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
  it('hands the real strict attribution parser exactly its keys and the account separately', async () => {
    const h = fixture();
    await h.service.execute(h.request);
    for (const [call] of h.text.generate.mock.calls) {
      expect(
        strategyBudgetAttributionSchema.safeParse(call.admission.scope),
      ).toMatchObject({ success: true });
      expect(call.admission.scope).not.toHaveProperty('credentialId');
      expect(call.admission.credentialId).toBe('credential-a');
    }
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
  it('reports a draft held for brand review as a settled hold and still drafts the siblings', async () => {
    const h = fixture();
    vi.mocked(readBreakoutOutputRecovery).mockImplementation(
      async (_tx, input) => ({
        status: 'available',
        responseId: input.responseId,
        outputId: input.outputId,
        state: 'awaiting_review',
        reason: 'brand_review_required',
        action: 'none',
        mayRepeatPaidRequest: false,
        postId: 'draft-a',
        externalId: null,
      }),
    );
    expect(await h.service.execute(h.request)).toMatchObject({
      status: 'held',
      reason: 'brand_review_required',
      outputs: h.rows.map((row) => ({ outputId: row.id })),
    });
    expect(h.text.generate).toHaveBeenCalledTimes(5);
  });
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

  describe('the organization opt-in (#6526)', () => {
    const off = {
      isBrandVisionChecksEnabled: false,
      isBreakoutAutoPublishEnabled: false,
      isBreakoutResponsesEnabled: false,
    };

    it('holds with org_breakout_disabled before it plans, reserves or spends anything', async () => {
      const h = fixture();
      h.prisma.organizationSetting.findFirst.mockResolvedValue(off);
      expect(await h.service.execute(h.request)).toEqual({
        status: 'held',
        responseId: 'response-a',
        reason: 'org_breakout_disabled',
        outputs: [],
      });
      expect(h.prisma.organizationSetting.findFirst).toHaveBeenCalledWith({
        select: expect.objectContaining({ isBreakoutResponsesEnabled: true }),
        where: { organizationId: 'org-a' },
      });
      expect(h.planner.prepare).not.toHaveBeenCalled();
      expect(h.prisma.$transaction).not.toHaveBeenCalled();
      expect(h.text.generate).not.toHaveBeenCalled();
      expect(h.media.generate).not.toHaveBeenCalled();
      expect(h.autoPublish.schedule).not.toHaveBeenCalled();
    });

    it('holds an organization without a settings row', async () => {
      const h = fixture();
      h.prisma.organizationSetting.findFirst.mockResolvedValue(
        null as unknown as typeof off,
      );
      expect(await h.service.execute(h.request)).toMatchObject({
        status: 'held',
        reason: 'org_breakout_disabled',
      });
      expect(h.planner.prepare).not.toHaveBeenCalled();
    });

    it('holds mid-flight when the setting is turned off after the first output', async () => {
      const h = fixture();
      // Start, then the first output's gate, then the second output's gate finds it off.
      h.prisma.organizationSetting.findFirst
        .mockResolvedValueOnce({
          ...off,
          isBreakoutResponsesEnabled: true,
        })
        .mockResolvedValueOnce({
          ...off,
          isBreakoutResponsesEnabled: true,
        })
        .mockResolvedValue(off);
      expect(await h.service.execute(h.request)).toMatchObject({
        status: 'held',
        reason: 'org_breakout_disabled',
        outputs: [{ outputId: 'output-1' }],
      });
      expect(h.text.generate).toHaveBeenCalledOnce();
      expect(h.rows[1]?.workflowExecutionId).toBeNull();
    });

    it('re-reads the setting for every execution instead of caching it', async () => {
      const h = fixture();
      await h.service.execute(h.request);
      h.prisma.organizationSetting.findFirst.mockResolvedValue(off);
      h.text.generate.mockClear();
      expect(await h.service.execute(h.request)).toMatchObject({
        status: 'held',
        reason: 'org_breakout_disabled',
      });
      expect(h.text.generate).not.toHaveBeenCalled();
    });

    it('offers each finished output to auto-publish, which keeps it a draft while that is off', async () => {
      const h = fixture();
      expect(await h.service.execute(h.request)).toMatchObject({
        status: 'completed',
        outputs: h.rows.map((row) => ({
          outputId: row.id,
          recovery: { state: 'draft' },
        })),
      });
      expect(h.autoPublish.schedule).toHaveBeenCalledTimes(5);
      expect(h.autoPublish.schedule).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          outputId: 'output-1',
          responseId: 'response-a',
          strategyId: 'strategy-a',
          scope: expect.objectContaining({ organizationId: 'org-a' }),
        }),
      );
    });

    it('never offers a held output to auto-publish', async () => {
      const h = fixture();
      h.text.generate.mockResolvedValueOnce({
        kind: 'stopped',
        reasonCode: 'quality_or_brand_blocked',
      });
      await h.service.execute(h.request);
      expect(h.autoPublish.schedule).not.toHaveBeenCalled();
    });

    it('reads the recovery again once an output was scheduled, so the report shows the schedule', async () => {
      const kept = fixture(['text']);
      vi.mocked(readBreakoutOutputRecovery).mockClear();
      await kept.service.execute(kept.request);
      const readsWhenKept = vi.mocked(readBreakoutOutputRecovery).mock.calls
        .length;
      const scheduled = fixture(['text']);
      scheduled.autoPublish.schedule.mockResolvedValueOnce({
        status: 'scheduled',
        postId: 'draft-a',
      });
      vi.mocked(readBreakoutOutputRecovery).mockClear();
      await scheduled.service.execute(scheduled.request);
      expect(
        vi.mocked(readBreakoutOutputRecovery).mock.calls.length,
      ).toBeGreaterThan(readsWhenKept);
    });
  });

  describe('visual outputs', () => {
    it('runs an image output through the caption, visual and composition pipeline under the output’s own scope', async () => {
      const h = fixture(['image', 'image'], Platform.INSTAGRAM);
      h.rows[0].format = 'image';
      expect(await h.service.execute(h.request)).toMatchObject({
        status: 'completed',
        outputs: [{ outputId: 'output-1' }, { outputId: 'output-2' }],
      });
      expect(h.text.generate).not.toHaveBeenCalled();
      expect(h.media.generate).toHaveBeenCalledTimes(2);
      expect(h.media.generate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          textModelKey: 'openai/gpt-5.2',
          mediaModelKey: 'media/model',
          admission: expect.objectContaining({
            outputId: 'output-1',
            credentialId: 'credential-a',
            actorUserId: 'configuring-user',
            workflowExecutionId: 'execution-a',
            componentKey: 'generation-1:caption',
            reauthorize: h.request.reauthorize,
          }),
        }),
      );
      for (const [call] of h.media.generate.mock.calls) {
        expect(
          strategyBudgetAttributionSchema.safeParse(call.admission.scope),
        ).toMatchObject({ success: true });
        expect(call.admission.scope).toMatchObject({
          platform: 'instagram',
          format: 'image',
          strategyId: 'strategy-a',
        });
      }
    });

    it('answers an X original with a text quote and visual follow-ups', async () => {
      const h = fixture(['text', 'image', 'image']);
      await h.service.execute(h.request);
      expect(h.text.generate).toHaveBeenCalledOnce();
      expect(h.media.generate).toHaveBeenCalledTimes(2);
    });

    it.each(['image', 'carousel', 'video', 'short'])(
      'covers a %s output with a fake-provider run to composition and recovery',
      async (format) => {
        const h = fixture([format], Platform.INSTAGRAM);
        expect(await h.service.execute(h.request)).toMatchObject({
          status: 'completed',
          outputs: [
            {
              outputId: 'output-1',
              recovery: { state: 'draft', mayRepeatPaidRequest: false },
            },
          ],
        });
        expect(
          h.media.generate.mock.calls[0]?.[0].admission.scope,
        ).toMatchObject({ format });
      },
    );

    it.each(['in_progress', 'stopped'] as const)(
      'stops siblings after a visual output is %s',
      async (kind) => {
        const h = fixture(['image', 'image', 'image'], Platform.INSTAGRAM);
        h.media.generate.mockResolvedValueOnce({
          kind,
          reasonCode: 'media_brand_capability_unavailable',
          postId: null as unknown as string,
        });
        expect(await h.service.execute(h.request)).toMatchObject({
          status: kind === 'stopped' ? 'held' : 'processing',
          reason:
            kind === 'stopped'
              ? 'media_brand_capability_unavailable'
              : 'provider_outcome_pending',
          outputs: [{ outputId: 'output-1' }],
        });
        expect(h.media.generate).toHaveBeenCalledOnce();
        expect(h.rows[1]?.workflowExecutionId).toBeNull();
      },
    );

    it('blocks siblings on a retained ambiguous visual attempt instead of spending again', async () => {
      const h = fixture(['video', 'video'], Platform.INSTAGRAM);
      for (const row of h.rows) row.format = 'video';
      vi.mocked(readBreakoutOutputRecovery).mockResolvedValueOnce({
        status: 'available',
        responseId: 'response-a',
        outputId: 'output-1',
        state: 'reconciliation_required',
        reason: 'media_generation_incomplete',
        action: 'reconcile',
        mayRepeatPaidRequest: false,
        postId: 'caption-a',
        externalId: null,
      });
      expect(await h.service.execute(h.request)).toMatchObject({
        status: 'processing',
        reason: 'provider_outcome_pending',
        outputs: [{ outputId: 'output-1' }],
      });
      expect(h.media.generate).toHaveBeenCalledOnce();
      expect(h.rows[1]?.workflowExecutionId).toBeNull();
    });

    it('resumes a claimed visual output on the same execution without a second claim', async () => {
      const h = fixture(['image'], Platform.INSTAGRAM);
      h.first.state = 'generating';
      h.first.workflowExecutionId = 'execution-a';
      await h.service.execute(h.request);
      expect(h.media.generate).toHaveBeenCalledOnce();
      expect(h.prisma.breakoutResponseOutput.updateMany).not.toHaveBeenCalled();
    });

    it('resumes a visual output whose quality gate is pending through the replay-safe pipeline', async () => {
      const h = fixture(['image'], Platform.INSTAGRAM);
      h.first.state = 'generating';
      h.first.workflowExecutionId = 'execution-a';
      h.first.heldReason = 'quality_evaluation_pending';
      await h.service.execute(h.request);
      expect(h.media.generate).toHaveBeenCalledOnce();
      expect(h.prisma.breakoutResponseOutput.updateMany).not.toHaveBeenCalled();
    });

    it('does not run a visual output a hold already settled', async () => {
      const h = fixture(['image'], Platform.INSTAGRAM);
      h.first.state = 'awaiting_review';
      h.first.workflowExecutionId = 'execution-a';
      h.first.heldReason = 'platform_quality_blocked';
      await h.service.execute(h.request);
      expect(h.media.generate).not.toHaveBeenCalled();
    });

    it('holds a visual output the plan has no visual model for, spending nothing', async () => {
      const h = fixture(['image'], Platform.INSTAGRAM);
      const plan = await h.planner.prepare();
      if (plan.status !== 'prepared') throw new Error('prepared plan expected');
      h.planner.prepare.mockResolvedValueOnce({ ...plan, mediaModelKey: null });
      const result = await h.service.execute(h.request);
      expect(result).toMatchObject({ status: 'held' });
      expect(h.media.generate).not.toHaveBeenCalled();
    });

    it('reports a visual draft held for brand review as a settled hold', async () => {
      const h = fixture(['image', 'image'], Platform.INSTAGRAM);
      vi.mocked(readBreakoutOutputRecovery).mockImplementation(
        async (_tx, input) => ({
          status: 'available',
          responseId: input.responseId,
          outputId: input.outputId,
          state: 'awaiting_review',
          reason: 'brand_review_required',
          action: 'none',
          mayRepeatPaidRequest: false,
          postId: 'composed-a',
          externalId: null,
        }),
      );
      expect(await h.service.execute(h.request)).toMatchObject({
        status: 'held',
        reason: 'brand_review_required',
      });
      expect(h.media.generate).toHaveBeenCalledTimes(2);
    });
  });
});
