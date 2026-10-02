import {
  AgentAutonomyMode,
  AgentPublishDecision,
  CreditTransactionCategory,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createProactiveProductionTurnFixture,
  PRODUCTION_TURN_COST_USD,
  PRODUCTION_TURN_DECOY,
  PRODUCTION_TURN_FOREIGN_MEMORY,
  PRODUCTION_TURN_MEMORY,
  PRODUCTION_TURN_TEXT,
  PRODUCTION_TURN_VOICE,
} from './proactive-agent-production-turn.fixture';

type Fixture = Awaited<ReturnType<typeof createProactiveProductionTurnFixture>>;

// Actual Nest lifecycle + Bull callback + production turn/context/financial
// services. Only the external inference response is scripted. The dedicated
// migrated database belongs exclusively to this focused run and is discarded
// afterward; it must not be shared with the full E2E suite.
describe('proactive production turn acceptance', () => {
  let fixture: Fixture;
  beforeAll(async () => {
    fixture = await createProactiveProductionTurnFixture();
  }, 45_000);
  afterAll(async () => {
    await fixture?.close();
  }, 15_000);

  it('runs a paid text turn through the real worker and settles its actual reservation once', async () => {
    const actor = await fixture.seedActor('text');
    const before = await fixture.credits.getOrganizationCreditsBalance(
      actor.organizationId,
    );
    const { execution, outcome } = await fixture.run(actor);
    expect(outcome.error).toBeNull();
    expect(execution.status).toBe('COMPLETED');
    expect(fixture.calls.processor).toHaveBeenCalledTimes(1);
    expect(fixture.calls.liveProcessor).not.toHaveBeenCalled();
    expect(fixture.calls.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.calls.execute).toHaveBeenCalledTimes(1);
    expect(fixture.calls.context).toHaveBeenCalledTimes(1);
    expect(fixture.calls.stream).toHaveBeenCalledTimes(1);
    expect(fixture.calls.reserve).toHaveBeenCalledTimes(1);
    expect(fixture.calls.settle).toHaveBeenCalledTimes(1);
    expect(fixture.calls.release).not.toHaveBeenCalled();
    expect(fixture.observed).toHaveLength(1);
    const providerInput = JSON.stringify(fixture.observed[0].messages);
    expect(providerInput).toContain(PRODUCTION_TURN_MEMORY);
    expect(providerInput).toContain(PRODUCTION_TURN_VOICE);
    expect(providerInput).not.toContain(PRODUCTION_TURN_DECOY);
    expect(providerInput).not.toContain(PRODUCTION_TURN_FOREIGN_MEMORY);
    const reservations = await fixture.prisma.creditReservation.findMany({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        workloadType: 'agent-llm-round',
      },
    });
    expect(reservations).toHaveLength(1);
    expect(fixture.heldReservationIds).toEqual([reservations[0].id]);
    const reservation = reservations[0];
    const { AGENT_RUNTIME_ACTION_IDS } = await import(
      '@api/collections/workflows/services/agent-runtime-workflow-definitions'
    );
    const { workflowGenerationOperationId } = await import(
      '@api/helpers/utils/credits/workflow-generation-evidence.util'
    );
    const attribution = {
      workflowExecutionId: execution.id,
      workflowNodeId: 'infer-turn',
      workflowOperationId: workflowGenerationOperationId(
        execution.id,
        'infer-turn',
        AGENT_RUNTIME_ACTION_IDS.TURN_INFER,
      ),
    };
    const cost = fixture.registry.toRoundCredits(PRODUCTION_TURN_COST_USD);
    expect(cost).toBeGreaterThan(0);
    expect(reservation).toMatchObject({
      actorUserId: actor.userId,
      status: 'SETTLED',
      idempotencyKey: `${execution.id}:agent-llm-round:1`,
      workloadId: `${execution.id}:agent-llm-round:1`,
      settledAmount: cost,
      ...attribution,
    });
    const debits = await fixture.prisma.creditTransaction.findMany({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        category: CreditTransactionCategory.DEDUCT,
        reservationId: reservation.id,
        workflowExecutionId: execution.id,
      },
    });
    expect(debits).toHaveLength(1);
    expect(debits[0]).toMatchObject({
      actorUserId: actor.userId,
      reservationId: reservation.id,
      amount: cost,
      category: CreditTransactionCategory.DEDUCT,
      ...attribution,
    });
    expect(
      await fixture.credits.getOrganizationCreditsBalance(actor.organizationId),
    ).toBeCloseTo(before - cost, 6);
    const thread = await fixture.prisma.agentThread.findFirstOrThrow({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        agentStrategyId: actor.strategyId,
      },
    });
    const messages = await fixture.prisma.agentMessage.findMany({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        threadId: thread.id,
      },
    });
    expect(
      messages.some(
        (message) =>
          message.role === 'assistant' &&
          message.content?.includes(PRODUCTION_TURN_TEXT),
      ),
    ).toBe(true);
    const snapshots = await fixture.prisma.agentThreadSnapshot.findMany({
      where: {
        organizationId: actor.organizationId,
        threadId: thread.id,
        isDeleted: false,
      },
    });
    expect(JSON.stringify(snapshots)).toContain(execution.id);
    const events = await fixture.prisma.agentThreadEvent.count({
      where: {
        organizationId: actor.organizationId,
        threadId: thread.id,
        isDeleted: false,
      },
    });
    expect(events).toBeGreaterThan(0);
    // This is an acceptance assertion, not an assumed fixture-side attribution.
    // A missing link exposes real proactive accounting as a production defect.
    expect(
      reservation.workflowExecutionId,
      'Actual round reservation must retain workflow attribution',
    ).toBe(execution.id);
    expect(
      debits[0].workflowExecutionId,
      'Actual debit must retain workflow attribution',
    ).toBe(execution.id);
    const strategy = await fixture.prisma.agentStrategy.findFirstOrThrow({
      where: {
        id: actor.strategyId,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    expect(strategy.config).toMatchObject({
      creditsUsedToday: cost,
      creditsUsedThisWeek: cost,
      runHistory: [
        expect.objectContaining({
          executionId: execution.id,
          creditsUsed: cost,
        }),
      ],
    });
    const reports = await fixture.prisma.agentStrategyReport.findMany({
      where: {
        strategyId: actor.strategyId,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    expect(reports).toHaveLength(1);
    expect(reports[0].data).toMatchObject({
      creditsSpent: cost,
      metadata: { executionId: execution.id },
    });
    fixture.assertTransports();
  }, 40_000);

  it('releases the real financial hold when the external inference call fails', async () => {
    const actor = await fixture.seedActor('provider-failure');
    const before = await fixture.credits.getOrganizationCreditsBalance(
      actor.organizationId,
    );
    const { execution, outcome } = await fixture.run(actor);
    expect(outcome.error).toContain('4959 scripted provider failure');
    expect(execution.status).toBe('FAILED');
    expect(fixture.calls.prepare).toHaveBeenCalled();
    expect(fixture.calls.execute).toHaveBeenCalled();
    expect(fixture.calls.context).toHaveBeenCalled();
    expect(fixture.calls.stream).toHaveBeenCalled();
    expect(fixture.calls.reserve).toHaveBeenCalledTimes(1);
    expect(fixture.calls.release).toHaveBeenCalledTimes(1);
    expect(fixture.calls.settle).not.toHaveBeenCalled();
    expect(fixture.observed).toHaveLength(1);
    const reservations = await fixture.prisma.creditReservation.findMany({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        workloadType: 'agent-llm-round',
      },
    });
    expect(reservations).toHaveLength(1);
    expect(fixture.heldReservationIds).toEqual([reservations[0].id]);
    expect(reservations[0]).toMatchObject({
      status: 'RELEASED',
      idempotencyKey: `${execution.id}:agent-llm-round:1`,
      actorUserId: actor.userId,
    });
    expect(
      await fixture.prisma.creditTransaction.count({
        where: {
          organizationId: actor.organizationId,
          isDeleted: false,
          category: CreditTransactionCategory.DEDUCT,
          reservationId: reservations[0].id,
          workflowExecutionId: execution.id,
        },
      }),
    ).toBe(0);
    expect(
      await fixture.credits.getOrganizationCreditsBalance(actor.organizationId),
    ).toBe(before);
    fixture.assertTransports();
  }, 40_000);

  it('requires the real authorizer to produce a strategy-attributed draft without fabricated confirmation', async () => {
    const actor = await fixture.seedActor('draft');
    const { AgentThreadsService } = await import(
      '@api/collections/agent-threads/services/agent-threads.service'
    );
    const threadReads = vi.spyOn(
      fixture.module.get(AgentThreadsService),
      'findOne',
    );
    try {
      const { execution, outcome } = await fixture.run(actor);
      expect(outcome.error).toBeNull();
      expect(execution.status).toBe('COMPLETED');
      expect(fixture.calls.tools).toHaveBeenCalled();
      expect(fixture.calls.authorize).toHaveBeenCalled();
      const authorization = fixture.calls.authorize.mock.calls.find(
        (call) => call[0] === 'create_post',
      );
      expect(authorization).toBeDefined();
      const authorizationIndex = fixture.calls.authorize.mock.calls.findIndex(
        (call) => call[0] === 'create_post',
      );
      const authorizationResult =
        fixture.calls.authorize.mock.results[authorizationIndex];
      expect(authorizationResult.type).toBe('return');
      expect(await authorizationResult.value).toEqual({
        kind: 'execute',
        constraint: 'proactive-text-draft-only',
      });
      expect(authorization?.[1]).not.toHaveProperty('confirmed');
      expect(authorization?.[2]).not.toHaveProperty('approvedApprovalId');
      expect(authorization?.[2]).not.toHaveProperty(
        'confirmationOrigin',
        'thread-ui-action',
      );
      const posts = await fixture.prisma.post.findMany({
        where: {
          organizationId: actor.organizationId,
          isDeleted: false,
          agentStrategyId: actor.strategyId,
        },
      });
      expect(
        posts,
        'An approval preview is a production acceptance blocker, not a fixture-created draft',
      ).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        brandId: actor.brandId,
        workflowExecutionId: execution.id,
        status: ReleaseStatus.DRAFT,
        targetExecutionState: TargetExecutionState.DRAFT,
        scheduledDate: null,
        publishedAt: null,
        publishApprovalId: null,
      });
      expect(posts[0].groupId).toBeTruthy();
      const group = await fixture.prisma.postGroup.findFirstOrThrow({
        where: {
          id: posts[0].groupId ?? '',
          organizationId: actor.organizationId,
          isDeleted: false,
        },
      });
      expect(group).toMatchObject({
        status: ReleaseStatus.DRAFT,
        scheduledAt: null,
        publishedAt: null,
        brandId: actor.brandId,
      });
      const batches = await fixture.prisma.batch.findMany({
        where: {
          organizationId: actor.organizationId,
          isDeleted: false,
          brandId: actor.brandId,
          agentStrategyId: actor.strategyId,
        },
      });
      expect(batches).toHaveLength(1);
      const items = await fixture.prisma.batchItem.findMany({
        where: {
          organizationId: actor.organizationId,
          isDeleted: false,
          brandId: actor.brandId,
          batchId: batches[0].id,
        },
      });
      expect(items).toHaveLength(1);
      expect(items[0].data).toMatchObject({
        postId: posts[0].id,
        workflowExecutionId: execution.id,
        platform: 'linkedin',
      });
      const audits = await fixture.prisma.agentPublishAudit.findMany({
        where: {
          organizationId: actor.organizationId,
          isDeleted: false,
          workflowExecutionId: execution.id,
          postGroupId: group.id,
        },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        decision: AgentPublishDecision.DENIED,
        agentStrategyId: actor.strategyId,
      });
      expect(
        await fixture.prisma.mcpApproval.count({
          where: {
            organizationId: actor.organizationId,
            isDeleted: false,
            toolName: 'create_post',
          },
        }),
      ).toBe(0);
      // PublishApproval has no soft-delete column; the tenant and target are explicit.
      expect(
        await fixture.prisma.publishApproval.count({
          where: {
            organizationId: actor.organizationId,
            postId: posts[0].id,
          },
        }),
      ).toBe(0);
      const thread = await fixture.prisma.agentThread.findFirstOrThrow({
        where: {
          organizationId: actor.organizationId,
          isDeleted: false,
          agentStrategyId: actor.strategyId,
        },
      });
      const threadReadIndex = threadReads.mock.calls.findIndex(
        ([input]) =>
          input?.id === thread.id &&
          input.organizationId === actor.organizationId &&
          input.userId === actor.userId &&
          input.isDeleted === false,
      );
      expect(threadReadIndex).toBeGreaterThanOrEqual(0);
      const threadRead = threadReads.mock.results[threadReadIndex];
      expect(threadRead.type).toBe('return');
      expect(thread.mode).toBe((await threadRead.value)?.mode);
      fixture.assertTransports();
    } finally {
      threadReads.mockRestore();
    }
  }, 40_000);

  async function assertSinglePaidExecution(
    actor: Parameters<Fixture['run']>[0],
    executionId: string,
  ) {
    const { execution, outcome } = await fixture.waitForDispatch(
      actor,
      executionId,
    );
    expect(outcome.error).toBeNull();
    expect(execution.status).toBe('COMPLETED');
    expect(
      await fixture.prisma.workflowExecution.count({
        where: {
          organizationId: actor.organizationId,
          isDeleted: false,
          idempotencyKey: { startsWith: 'proactive:' },
        },
      }),
    ).toBe(1);
    const reservations = await fixture.prisma.creditReservation.findMany({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        workloadType: 'agent-llm-round',
      },
    });
    expect(reservations).toHaveLength(1);
    const reservation = reservations[0];
    const { AGENT_RUNTIME_ACTION_IDS } = await import(
      '@api/collections/workflows/services/agent-runtime-workflow-definitions'
    );
    const { workflowGenerationOperationId } = await import(
      '@api/helpers/utils/credits/workflow-generation-evidence.util'
    );
    const attribution = {
      workflowExecutionId: executionId,
      workflowNodeId: 'infer-turn',
      workflowOperationId: workflowGenerationOperationId(
        executionId,
        'infer-turn',
        AGENT_RUNTIME_ACTION_IDS.TURN_INFER,
      ),
    };
    const cost = fixture.registry.toRoundCredits(PRODUCTION_TURN_COST_USD);
    expect(reservation).toMatchObject({
      ...attribution,
      actorUserId: actor.userId,
      status: 'SETTLED',
      idempotencyKey: `${executionId}:agent-llm-round:1`,
      workloadId: `${executionId}:agent-llm-round:1`,
      settledAmount: cost,
    });
    const debits = await fixture.prisma.creditTransaction.findMany({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        category: CreditTransactionCategory.DEDUCT,
      },
    });
    expect(debits).toHaveLength(1);
    expect(debits[0]).toMatchObject({
      ...attribution,
      actorUserId: actor.userId,
      reservationId: reservation.id,
      category: CreditTransactionCategory.DEDUCT,
      amount: cost,
    });
    expect(fixture.calls.reserve).toHaveBeenCalledTimes(1);
    expect(fixture.calls.settle).toHaveBeenCalledTimes(1);
    expect(fixture.calls.release).not.toHaveBeenCalled();
    expect(fixture.observed).toHaveLength(1);
    expect(fixture.heldReservationIds).toEqual([reservation.id]);
    fixture.assertTransports();
  }

  it('holds the real dispatch backend beyond thirty seconds while a paid provider round is pending', async () => {
    const actor = await fixture.seedActor('text');
    const admission = await fixture.pauseDispatch('accepted');
    const provider = fixture.pauseProvider();
    const first = fixture.dispatch(actor).then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
    try {
      await waitForDispatchBarrier(admission.entered);
      await waitForDispatchBarrier(provider.entered);
      const owner = await fixture.observeDispatchLock(actor);
      const started = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 31_000));
      expect(Date.now() - started).toBeGreaterThanOrEqual(30_000);
      expect(await fixture.observeDispatchLock(actor)).toEqual(owner);
      expect(await fixture.contendDispatchLock(actor)).toBe(false);
      expect(await fixture.dispatch(actor)).toEqual({ status: 'skipped' });
      expect(fixture.calls.reserve).toHaveBeenCalledTimes(1);
      expect(fixture.calls.settle).not.toHaveBeenCalled();
      admission.resume();
      provider.resume();
      const result = await first;
      expect(result.error).toBeNull();
      expect(typeof result.value?.executionId).toBe('string');
      await assertSinglePaidExecution(actor, String(result.value?.executionId));
    } finally {
      admission.resume();
      provider.resume();
      await first;
      admission.restore();
    }
  }, 60_000);

  it('rejects a terminated owned dispatch backend before admission without a reservation or failure increment', async () => {
    const actor = await fixture.seedActor('text');
    const original = await fixture.prisma.agentStrategy.findFirstOrThrow({
      where: {
        id: actor.strategyId,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    const preparation = await fixture.pauseDispatch('preparation');
    const first = fixture.dispatch(actor).then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
    try {
      await waitForDispatchBarrier(preparation.entered);
      const owner = await fixture.observeDispatchLock(actor);
      await fixture.terminateDispatchOwner(actor, owner);
      preparation.resume();
      const result = await first;
      expect(result.value).toBeNull();
      expect(result.error).toMatchObject({
        name: 'ProactiveDispatchOwnershipError',
      });
      expect(
        await fixture.prisma.workflowExecution.count({
          where: {
            organizationId: actor.organizationId,
            isDeleted: false,
            idempotencyKey: { startsWith: 'proactive:' },
          },
        }),
      ).toBe(0);
      expect(
        await fixture.prisma.creditReservation.count({
          where: {
            organizationId: actor.organizationId,
            isDeleted: false,
          },
        }),
      ).toBe(0);
      expect(
        await fixture.prisma.agentThread.count({
          where: {
            organizationId: actor.organizationId,
            agentStrategyId: actor.strategyId,
            isDeleted: false,
          },
        }),
      ).toBe(0);
      const unchanged = await fixture.prisma.agentStrategy.findFirstOrThrow({
        where: {
          id: actor.strategyId,
          organizationId: actor.organizationId,
          isDeleted: false,
        },
      });
      expect(unchanged.config).toEqual(original.config);
      expect(fixture.observed).toHaveLength(0);
      preparation.restore();
      const retry = await fixture.dispatch(actor);
      expect(typeof retry.executionId).toBe('string');
      await assertSinglePaidExecution(actor, String(retry.executionId));
    } finally {
      preparation.resume();
      await first;
      preparation.restore();
    }
  }, 60_000);

  it('recovers an accepted enqueue after owned backend loss with one durable paid identity', async () => {
    const actor = await fixture.seedActor('text');
    await fixture.platformQueue.pause();
    const admission = await fixture.pauseDispatch('accepted');
    const first = fixture.dispatch(actor).then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
    try {
      await waitForDispatchBarrier(admission.entered);
      const accepted = await fixture.prisma.workflowExecution.findMany({
        where: {
          organizationId: actor.organizationId,
          isDeleted: false,
          idempotencyKey: { startsWith: 'proactive:' },
        },
      });
      expect(accepted).toHaveLength(1);
      expect(accepted[0].status).toBe('PENDING');
      const execution = accepted[0];
      const jobId = `system-workflow-${execution.id}`;
      const job = await fixture.platformQueue.getJob(jobId);
      expect(job).toBeDefined();
      const frozenJob = structuredClone(job?.data);
      expect(fixture.calls.reserve).not.toHaveBeenCalled();
      const owner = await fixture.observeDispatchLock(actor);
      await fixture.terminateDispatchOwner(actor, owner);
      admission.resume();
      const result = await first;
      expect(result.value).toBeNull();
      expect(result.error).toMatchObject({
        name: 'ProactiveDispatchOwnershipError',
      });
      admission.restore();
      expect(await fixture.dispatch(actor)).toMatchObject({
        executionId: execution.id,
      });
      const recovered = await fixture.prisma.workflowExecution.findFirstOrThrow(
        {
          where: {
            id: execution.id,
            organizationId: actor.organizationId,
            isDeleted: false,
          },
        },
      );
      expect(recovered.idempotencyKey).toBe(execution.idempotencyKey);
      expect(recovered.result).toEqual(execution.result);
      expect((await fixture.platformQueue.getJob(jobId))?.data).toEqual(
        frozenJob,
      );
      expect(
        await fixture.platformQueue.getJobCounts(
          'waiting',
          'active',
          'delayed',
        ),
      ).toMatchObject({ waiting: 1, active: 0, delayed: 0 });
      expect(await fixture.platformQueue.isPaused()).toBe(true);
      await fixture.platformQueue.resume();
      await assertSinglePaidExecution(actor, execution.id);
      expect(await fixture.dispatch(actor)).toEqual({ status: 'skipped' });
      expect(fixture.calls.reserve).toHaveBeenCalledTimes(1);
      expect(fixture.calls.settle).toHaveBeenCalledTimes(1);
    } finally {
      admission.resume();
      await first;
      admission.restore();
      await fixture.platformQueue.resume();
    }
  }, 60_000);
});

async function waitForDispatchBarrier(entered: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      entered,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Dispatch barrier was not reached')),
          10_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
