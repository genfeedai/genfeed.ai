import { AgentTurnWorkflowExecutionService } from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service';
import { AgentAutonomyMode, AgentMessageRole } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

function setup(source = 'proactive', lockedModel?: string) {
  const prisma = {
    agentThread: {
      findFirst: vi.fn().mockResolvedValue({
        brandId: 'brand',
        contextVersion: 1,
        status: 'active',
        agentStrategyId: 'strategy',
      }),
    },
    agentStrategy: { findFirst: vi.fn().mockResolvedValue({ id: 'strategy' }) },
    workflowExecution: {
      findFirst: vi.fn().mockResolvedValue({
        result: { metadata: { source, strategyId: 'strategy' } },
      }),
    },
  };
  const scope = { brandId: 'brand', organizationId: 'org', contextVersion: 1 };
  const context = {
    resolveSystemPromptAndModel: vi.fn().mockResolvedValue({
      preparedScope: { existingScope: scope },
      model: 'model',
      policy: { autonomyMode: AgentAutonomyMode.SUPERVISED },
      systemPrompt: 'brand voice and feedback memory',
      memories: ['feedback'],
    }),
  };
  const plan = {
    tryHandlePlanModeTurnStream: vi.fn().mockResolvedValue(false),
  };
  const batch = {
    tryHandleBatchGenerationTurnStream: vi.fn().mockResolvedValue(false),
  };
  const recurring = {
    tryHandleRecurringTaskDraftTurnStream: vi.fn().mockResolvedValue(false),
  };
  const stream = { runStreamLoop: vi.fn().mockResolvedValue(undefined) };
  const modelAccess = {
    enforceModel: vi.fn(
      async (_organizationId: string, model: string) => lockedModel ?? model,
    ),
  };
  const service = Reflect.construct(AgentTurnWorkflowExecutionService, [
    prisma,
    { findOne: vi.fn().mockResolvedValue({}) },
    { findOne: vi.fn().mockResolvedValue({ title: 'Agent' }) },
    {
      addMessage: vi.fn(),
      getMessagesByRoom: vi.fn().mockResolvedValue([
        {
          role: AgentMessageRole.ASSISTANT,
          content: 'Completed',
          metadata: {},
        },
      ]),
    },
    { checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true) },
    {
      getDefaultModelKey: vi.fn().mockResolvedValue('model'),
      getRoundCredits: vi.fn().mockResolvedValue(1),
    },
    context,
    plan,
    batch,
    recurring,
    stream,
    {},
    {},
    { publishTurnPhase: vi.fn() },
    { recordThreadTurnRequested: vi.fn() },
    {
      runExclusive: vi.fn(async (_id: string, run: () => Promise<void>) =>
        run(),
      ),
    },
    { upsertBinding: vi.fn() },
    {},
    modelAccess,
  ]) as AgentTurnWorkflowExecutionService;
  return {
    service,
    prisma,
    plan,
    batch,
    recurring,
    stream,
    context,
    modelAccess,
  };
}
const workflowContext = {
  organizationId: 'org',
  userId: 'user',
  executionId: 'run',
};
const request = {
  content: 'Generate 5 posts this week',
  source: 'proactive',
  threadId: 'thread',
  brandId: 'brand',
  strategyId: 'strategy',
  creditBudget: 5,
  autonomyMode: AgentAutonomyMode.SUPERVISED,
};

describe('trusted proactive turn limits and memory routing', () => {
  it.each([NaN, Infinity, -1, '5', null])(
    'rejects malformed credit caps before execution: %s',
    async (creditBudget) => {
      const { service, stream } = setup();
      await expect(
        service.prepare({ ...request, creditBudget }, workflowContext),
      ).rejects.toThrow('finite and nonnegative');
      expect(stream.runStreamLoop).not.toHaveBeenCalled();
    },
  );
  it('rejects zero budget and invalid autonomy', async () => {
    const { service } = setup();
    await expect(
      service.prepare({ ...request, creditBudget: 0 }, workflowContext),
    ).rejects.toThrow('exhausted');
    await expect(
      service.prepare(
        { ...request, autonomyMode: 'unrestricted' },
        workflowContext,
      ),
    ).rejects.toThrow('unsupported');
  });
  it('requires trusted execution provenance and strategy scope', async () => {
    const { service, prisma } = setup('api');
    await expect(service.prepare(request, workflowContext)).rejects.toThrow(
      'trusted internal',
    );
    prisma.workflowExecution.findFirst.mockResolvedValue({
      result: { metadata: { source: 'proactive', strategyId: 'strategy' } },
    });
    prisma.agentStrategy.findFirst.mockResolvedValue(null as never);
    await expect(service.prepare(request, workflowContext)).rejects.toThrow(
      'trusted internal',
    );
  });
  it('projects trusted limits and uses assembled memory while bypassing deterministic paths', async () => {
    const { service, stream, plan, batch, recurring } = setup();
    const prepared = await service.prepare(request, workflowContext);
    expect(prepared.state.request).toMatchObject({
      creditBudget: 5,
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      source: 'proactive',
    });
    await service.execute(prepared.state);
    expect(plan.tryHandlePlanModeTurnStream).not.toHaveBeenCalled();
    expect(batch.tryHandleBatchGenerationTurnStream).not.toHaveBeenCalled();
    expect(
      recurring.tryHandleRecurringTaskDraftTurnStream,
    ).not.toHaveBeenCalled();
    expect(stream.runStreamLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        creditBudget: 5,
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        strategyId: 'strategy',
      }),
      'thread',
      'brand voice and feedback memory',
      'model',
      1,
      expect.anything(),
      undefined,
      ['feedback'],
      undefined,
      'proactive',
      'Agent',
      expect.any(String),
      undefined,
    );
  });
  it('preserves ordinary interactive routing', async () => {
    const { service, plan, batch, recurring, prisma } = setup('api');
    const prepared = await service.prepare(
      { content: 'Create a weekly task', threadId: 'thread', source: 'agent' },
      workflowContext,
    );
    await service.execute(prepared.state);
    expect(prisma.workflowExecution.findFirst).not.toHaveBeenCalled();
    expect(plan.tryHandlePlanModeTurnStream).toHaveBeenCalledOnce();
    expect(batch.tryHandleBatchGenerationTurnStream).toHaveBeenCalledOnce();
    expect(
      recurring.tryHandleRecurringTaskDraftTurnStream,
    ).toHaveBeenCalledOnce();
  });
  it('runs a free-tier org on the locked model and drops its thinking override', async () => {
    const { service, stream, context, modelAccess } = setup(
      'proactive',
      'deepseek/deepseek-v4-flash-0731',
    );
    context.resolveSystemPromptAndModel.mockResolvedValue({
      preparedScope: {
        existingScope: {
          brandId: 'brand',
          contextVersion: 1,
          organizationId: 'org',
        },
      },
      model: 'anthropic/claude-opus-5',
      policy: {
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        thinkingModelOverride: 'anthropic/claude-opus-5',
      },
      systemPrompt: 'brand voice and feedback memory',
      memories: ['feedback'],
    });
    const prepared = await service.prepare(request, workflowContext);
    await service.execute(prepared.state);

    expect(modelAccess.enforceModel).toHaveBeenCalledWith(
      'org',
      'anthropic/claude-opus-5',
    );
    const call = stream.runStreamLoop.mock.calls[0];
    expect(call?.[3]).toBe('deepseek/deepseek-v4-flash-0731');
    expect(call?.[5]).toEqual(
      expect.objectContaining({ thinkingModelOverride: null }),
    );
  });
});
