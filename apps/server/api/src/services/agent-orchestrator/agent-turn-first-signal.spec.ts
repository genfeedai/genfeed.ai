import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import {
  AgentTurnWorkflowExecutionService,
  type PreparedAgentTurnState,
} from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service';
import { AgentGenerationMode } from '@genfeedai/contracts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup() {
  const settingsGate = deferred();
  const settingsEntered = deferred();
  const promptGate = deferred();
  const promptEntered = deferred();
  const laneGate = deferred();
  const laneEntered = deferred();
  const publisher = {
    publishStreamStart: vi.fn(),
    publishTurnPhase: vi.fn(),
    publishWorkEvent: vi.fn(),
  };
  const logger = { warn: vi.fn() };
  const effects = new AgentStreamEffectsService(
    publisher as never,
    logger as never,
    {} as never,
  );
  const state: PreparedAgentTurnState = {
    executionId: 'run-1',
    organizationId: 'org-1',
    request: { content: 'Hello', threadId: 'thread-1' },
    threadId: 'thread-1',
    userId: 'user-1',
  };
  const settings = {
    findOne: vi.fn(async () => {
      settingsEntered.resolve();
      await settingsGate.promise;
      return undefined;
    }),
  };
  const context = {
    resolveSystemPromptAndModel: vi.fn(async () => {
      promptEntered.resolve();
      await promptGate.promise;
      return {
        model: 'test-model',
        policy: { generationPriority: 'speed' },
        preparedScope: {
          existingScope: {
            contextVersion: 0,
            isLegacyFallback: false,
            isVersionExplicit: false,
            organizationId: state.organizationId,
            source: 'thread',
            threadId: state.threadId,
            userId: state.userId,
          },
        },
        systemPrompt: 'Resolved prompt',
      };
    }),
  };
  const streamLoop = {
    runStreamLoop: vi.fn(async () => {
      await effects.publishStreamLifecycleStarted({
        context: {
          executionId: state.executionId,
          organizationId: state.organizationId,
          userId: state.userId,
        },
        model: 'test-model',
        threadId: state.threadId,
      });
    }),
  };
  const lane = {
    runExclusive: vi.fn(async (_threadId: string, run: () => Promise<void>) => {
      laneEntered.resolve();
      await laneGate.promise;
      await run();
    }),
  };
  const uiAction = {
    handleThreadUiAction: vi.fn().mockResolvedValue({
      creditsRemaining: 90,
      creditsUsed: 10,
      message: {
        content: 'Image generation accepted.',
        metadata: {},
        role: 'assistant',
      },
      threadId: state.threadId,
      toolCalls: [],
    }),
  };
  const dependencies = [
    {},
    settings,
    {
      findOne: vi
        .fn()
        .mockResolvedValue({ id: state.threadId, title: 'Hello' }),
    },
    {
      addMessage: vi.fn(),
      getMessagesByRoom: vi
        .fn()
        .mockResolvedValue([{ content: 'Hello back', role: 'assistant' }]),
    },
    { checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true) },
    {
      getDefaultModelKey: vi.fn().mockResolvedValue('test-model'),
      getRoundCredits: vi.fn().mockResolvedValue(1),
    },
    context,
    { tryHandlePlanModeTurnStream: vi.fn().mockResolvedValue(false) },
    { tryHandleBatchGenerationTurnStream: vi.fn().mockResolvedValue(false) },
    { tryHandleRecurringTaskDraftTurnStream: vi.fn().mockResolvedValue(false) },
    streamLoop,
    {},
    uiAction,
    effects,
    { recordThreadTurnRequested: vi.fn() },
    lane,
    { upsertBinding: vi.fn() },
    {},
    {
      enforceModel: vi.fn(
        async (_organizationId: string, model: string) => model,
      ),
    },
  ];
  const service = Reflect.construct(
    AgentTurnWorkflowExecutionService,
    dependencies,
  ) as AgentTurnWorkflowExecutionService;
  return {
    context,
    lane,
    laneEntered,
    laneGate,
    logger,
    promptEntered,
    promptGate,
    publisher,
    service,
    settings,
    settingsEntered,
    settingsGate,
    state,
    streamLoop,
    uiAction,
  };
}

describe('agent turn first signal', () => {
  it('publishes preparing before deferred settings and prompt resolution, then waiting before lane acquisition', async () => {
    const h = setup();
    const turn = h.service.execute(h.state);
    await h.settingsEntered.promise;
    expect(h.publisher.publishTurnPhase).toHaveBeenCalledExactlyOnceWith({
      organizationId: h.state.organizationId,
      phase: 'preparing',
      runId: h.state.executionId,
      threadId: h.state.threadId,
      timestamp: expect.any(String),
      userId: h.state.userId,
    });
    expect(h.context.resolveSystemPromptAndModel).not.toHaveBeenCalled();
    expect(h.publisher.publishStreamStart).not.toHaveBeenCalled();
    h.settingsGate.resolve();
    await h.promptEntered.promise;
    expect(h.publisher.publishTurnPhase).toHaveBeenCalledTimes(1);
    expect(h.lane.runExclusive).not.toHaveBeenCalled();
    h.promptGate.resolve();
    await h.laneEntered.promise;
    expect(h.publisher.publishTurnPhase).toHaveBeenNthCalledWith(2, {
      organizationId: h.state.organizationId,
      phase: 'waiting_for_lane',
      runId: h.state.executionId,
      threadId: h.state.threadId,
      timestamp: expect.any(String),
      userId: h.state.userId,
    });
    expect(
      h.publisher.publishTurnPhase.mock.invocationCallOrder[1],
    ).toBeLessThan(h.lane.runExclusive.mock.invocationCallOrder[0]);
    expect(h.streamLoop.runStreamLoop).not.toHaveBeenCalled();
    expect(h.publisher.publishStreamStart).not.toHaveBeenCalled();
    h.laneGate.resolve();
    await expect(turn).resolves.toMatchObject({
      content: 'Hello back',
      model: 'test-model',
      threadId: h.state.threadId,
    });
    expect(h.publisher.publishStreamStart).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        model: 'test-model',
        runId: h.state.executionId,
      }),
    );
    expect(h.publisher.publishWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'started', label: 'Agent started' }),
    );
  });

  it('continues through the lane and existing lifecycle after phase publication fails', async () => {
    const h = setup();
    h.publisher.publishTurnPhase.mockRejectedValue(
      new Error('Private request error'),
    );
    h.settingsGate.resolve();
    h.promptGate.resolve();
    h.laneGate.resolve();
    await expect(h.service.execute(h.state)).resolves.toMatchObject({
      content: 'Hello back',
    });
    expect(h.streamLoop.runStreamLoop).toHaveBeenCalledOnce();
    expect(h.publisher.publishStreamStart).toHaveBeenCalledOnce();
    expect(h.logger.warn).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(h.logger.warn.mock.calls)).not.toContain(
      'Private request',
    );
  });

  it('keeps explicit media on the existing UI-action path without chat preparation phases', async () => {
    const h = setup();
    await expect(
      h.service.execute({
        ...h.state,
        request: {
          ...h.state.request,
          generationMode: AgentGenerationMode.IMAGE,
          requestedSkillSlugs: ['cinema'],
        },
      }),
    ).resolves.toMatchObject({ content: 'Image generation accepted.' });
    expect(h.uiAction.handleThreadUiAction).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ requestedSkillSlugs: ['cinema'] }),
      }),
      expect.objectContaining({ requestedSkillSlugs: ['cinema'] }),
      expect.anything(),
    );
    expect(h.publisher.publishTurnPhase).not.toHaveBeenCalled();
    expect(h.settings.findOne).not.toHaveBeenCalled();
    expect(h.context.resolveSystemPromptAndModel).not.toHaveBeenCalled();
    expect(h.lane.runExclusive).not.toHaveBeenCalled();
    expect(h.streamLoop.runStreamLoop).not.toHaveBeenCalled();
  });
});
