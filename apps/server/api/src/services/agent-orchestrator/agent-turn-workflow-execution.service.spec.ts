import {
  getActionOriginContext,
  runWithActionOrigin,
} from '@api/action-origin/action-origin.context';
import { AGENT_RUNTIME_ACTION_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';
import { AgentTurnWorkflowExecutionService } from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service';
import {
  ActionOrigin,
  AgentAutonomyMode,
  AgentMessageRole,
} from '@genfeedai/contracts';
import {
  GenerationEntryAttribution,
  GenerationEntryChannel,
} from '@genfeedai/contracts/interfaces/content/generation-entry.interface';
import { describe, expect, it, vi } from 'vitest';

function setup(source = 'proactive', priorMessageCount = 0) {
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
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const workflows = {
    registerAction: vi.fn(
      (id: string, executor: SystemWorkflowActionExecutor) =>
        actions.set(id, executor),
    ),
  };
  const service = Reflect.construct(AgentTurnWorkflowExecutionService, [
    prisma,
    { findOne: vi.fn().mockResolvedValue({}) },
    { findOne: vi.fn().mockResolvedValue({ title: 'Agent' }) },
    {
      addMessage: vi.fn(),
      countMessages: vi.fn().mockResolvedValue(priorMessageCount),
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
    workflows,
  ]) as AgentTurnWorkflowExecutionService;
  return {
    service,
    prisma,
    plan,
    batch,
    recurring,
    stream,
    context,
    actions,
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
  it('projects the persisted invocation entry into execution and rejects malformed labels', async () => {
    const { service, stream } = setup();
    const generationEntry = {
      channel: GenerationEntryChannel.DESKTOP,
      attribution: GenerationEntryAttribution.CLIENT_REPORTED,
    };
    const prepared = await service.prepare(
      { ...request, generationEntry },
      workflowContext,
    );
    expect(prepared.state.request.generationEntry).toEqual(generationEntry);
    await service.execute(prepared.state);
    expect(stream.runStreamLoop.mock.calls[0][0]).toMatchObject({
      generationEntry,
    });
    const legacy = await service.prepare(request, workflowContext);
    expect(legacy.state.request).not.toHaveProperty('generationEntry');
    const malformed = await service.prepare(
      {
        ...request,
        generationEntry: { channel: 'desktop', attribution: 'server_verified' },
      },
      workflowContext,
    );
    expect(malformed.state.request).not.toHaveProperty('generationEntry');
  });

  it('restores the queued entry at the worker boundary while retaining the proven actor', async () => {
    const { service, actions } = setup();
    const generationEntry = {
      channel: GenerationEntryChannel.DESKTOP,
      attribution: GenerationEntryAttribution.CLIENT_REPORTED,
    };
    const prepared = await service.prepare(
      { ...request, generationEntry },
      workflowContext,
    );
    service.onModuleInit();
    vi.spyOn(service, 'execute').mockImplementationOnce(async (state) => {
      expect(getActionOriginContext()).toEqual({
        origin: ActionOrigin.API,
        actorUserId: 'actor',
        apiKeyId: 'key',
        generationEntry,
      });
      return {
        artifactReferences: [],
        artifactVersionPinIds: [],
        content: 'done',
        creditsUsed: 0,
        model: null,
        summary: 'done',
        threadId: state.threadId,
      };
    });
    const infer = actions.get(AGENT_RUNTIME_ACTION_IDS.TURN_INFER);
    if (!infer) throw new Error('Missing inference worker action');
    await runWithActionOrigin(
      {
        origin: ActionOrigin.API,
        actorUserId: 'actor',
        apiKeyId: 'key',
        generationEntry: {
          channel: GenerationEntryChannel.API,
          attribution: GenerationEntryAttribution.SERVER_VERIFIED,
        },
      },
      () =>
        infer({
          context: {
            organizationId: 'org',
            runId: 'run',
            userId: 'user',
            workflowId: 'workflow',
            workflowVersionId: 'version',
          },
          input: { state: prepared.state },
          provenance: {
            executionId: 'run',
            workflowId: 'workflow',
            workflowLabel: 'Agent',
          },
        }),
    );
    expect(service.execute).toHaveBeenCalledOnce();
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
  it('runs the turn on the chokepoint-resolved model and policy', async () => {
    const { service, stream, context } = setup('proactive');
    context.resolveSystemPromptAndModel.mockResolvedValue({
      preparedScope: {
        existingScope: {
          brandId: 'brand',
          contextVersion: 1,
          organizationId: 'org',
        },
      },
      model: 'deepseek/deepseek-v4-flash-0731',
      policy: {
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        thinkingModelOverride: null,
      },
      systemPrompt: 'brand voice and feedback memory',
      memories: ['feedback'],
    });
    const prepared = await service.prepare(request, workflowContext);
    await service.execute(prepared.state);

    const call = stream.runStreamLoop.mock.calls[0];
    expect(call?.[3]).toBe('deepseek/deepseek-v4-flash-0731');
    expect(call?.[5]).toEqual(
      expect.objectContaining({ thinkingModelOverride: null }),
    );
  });
});

describe('thread title seeding', () => {
  const interactive = {
    content: 'Try again',
    source: 'agent',
    threadId: 'thread',
  };

  it('seeds the title from the first message of a new thread', async () => {
    const { service, stream } = setup('api', 0);
    const prepared = await service.prepare(interactive, workflowContext);
    await service.execute(prepared.state);

    expect(stream.runStreamLoop.mock.calls[0]?.[10]).toBe('Agent');
  });

  it('never retitles the thread on follow-up messages', async () => {
    const { service, stream, plan } = setup('api', 2);
    const prepared = await service.prepare(interactive, workflowContext);
    await service.execute(prepared.state);

    expect(stream.runStreamLoop.mock.calls[0]?.[10]).toBe('');
    expect(plan.tryHandlePlanModeTurnStream).toHaveBeenCalledWith(
      expect.objectContaining({ seedTitle: '' }),
      expect.anything(),
    );
  });
});
