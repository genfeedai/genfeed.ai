import { AgentOrchestratorPlanModeService } from '@api/services/agent-orchestrator/agent-orchestrator-plan-mode.service';
import { testId } from '@helpers/testing/test-id.helper';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #4672: the thread's `planModeEnabled` boolean became `mode` (an
 * `AgentThreadMode` string) — `tryHandlePlanModeTurn`/
 * `tryHandlePlanModeTurnStream` must gate on `thread.mode === 'plan'` and
 * nothing else.
 */
describe('AgentOrchestratorPlanModeService — #4672 mode field', () => {
  let agentThreadsService: { findOne: ReturnType<typeof vi.fn> };
  let llmDispatcher: { chatCompletion: ReturnType<typeof vi.fn> };
  let agentMessagesService: { addMessage: ReturnType<typeof vi.fn> };
  let creditsUtilsService: {
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let threadEventRecorder: {
    recordPlanUpserted: ReturnType<typeof vi.fn>;
    recordAssistantFinalized: ReturnType<typeof vi.fn>;
    recordRunCompleted: ReturnType<typeof vi.fn>;
  };
  let streamEffects: {
    publishStreamDoneOnly: ReturnType<typeof vi.fn>;
    publishStreamInputRequestEvent: ReturnType<typeof vi.fn>;
  };
  let contextService: {
    resolveThreadMessages: ReturnType<typeof vi.fn>;
    buildMessageHistory: ReturnType<typeof vi.fn>;
  };
  let agentChatModelRegistry: {
    getDefaultModelKey: ReturnType<typeof vi.fn>;
    getRoundCredits: ReturnType<typeof vi.fn>;
    calculateRoundProviderCostUsd: ReturnType<typeof vi.fn>;
    toRoundCredits: ReturnType<typeof vi.fn>;
    getMaximumRoundCredits: ReturnType<typeof vi.fn>;
    getAutoAllowedModelKeys: ReturnType<typeof vi.fn>;
  };
  // #4865: `off` is the shipped default, so plan mode keeps today's request.
  let autoModelResolver: { resolve: ReturnType<typeof vi.fn> };
  let service: AgentOrchestratorPlanModeService;

  const organizationId = testId('org');
  const userId = testId('user');
  const threadId = testId('thread');
  const host = { maybeUpdateThreadTitle: vi.fn().mockResolvedValue(null) };

  beforeEach(() => {
    agentThreadsService = { findOne: vi.fn() };
    llmDispatcher = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content:
                '{"summary":"Plan drafted","content":"Do the thing","steps":[]}',
            },
          },
        ],
        model: 'test-model',
      }),
    };
    agentMessagesService = { addMessage: vi.fn() };
    creditsUtilsService = {
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
    };
    threadEventRecorder = {
      recordPlanUpserted: vi.fn(),
      recordAssistantFinalized: vi.fn(),
      recordRunCompleted: vi.fn(),
    };
    streamEffects = {
      publishStreamDoneOnly: vi.fn(),
      publishStreamInputRequestEvent: vi.fn(),
    };
    contextService = {
      resolveThreadMessages: vi
        .fn()
        .mockResolvedValue({ messages: [], compressedContext: undefined }),
      buildMessageHistory: vi.fn().mockReturnValue([]),
    };
    agentChatModelRegistry = {
      getDefaultModelKey: vi.fn().mockResolvedValue('test-model'),
      getRoundCredits: vi.fn().mockReturnValue(1),
      calculateRoundProviderCostUsd: vi.fn().mockResolvedValue(0.01),
      toRoundCredits: vi.fn().mockReturnValue(1),
      getMaximumRoundCredits: vi.fn().mockResolvedValue(10),
      getAutoAllowedModelKeys: vi.fn().mockResolvedValue([]),
    };
    autoModelResolver = {
      resolve: vi.fn().mockResolvedValue({ mode: 'off' }),
    };

    service = new AgentOrchestratorPlanModeService(
      agentThreadsService as never,
      llmDispatcher as never,
      agentMessagesService as never,
      creditsUtilsService as never,
      threadEventRecorder as never,
      streamEffects as never,
      contextService as never,
      agentChatModelRegistry as never,
      autoModelResolver as never,
    );
  });

  const baseParams = {
    context: { organizationId, userId },
    model: 'test-model',
    request: { content: 'What should I do next?', threadId },
    resolvedMemories: [],
    seedTitle: 'Thread',
    threadId,
    // Waives the LLM-round credit reservation (`runReservedAgentLlmRound`)
    // so this spec only needs `getOrganizationCreditsBalance` — the
    // reservation machinery itself is exercised elsewhere.
    turnCost: 0,
  };

  it.each(['auto', 'manual'])(
    'does not intercept the turn when the thread mode is %s',
    async (mode) => {
      agentThreadsService.findOne.mockResolvedValue({ mode });

      const result = await service.tryHandlePlanModeTurn(
        baseParams as never,
        host,
      );

      expect(result).toBeNull();
      expect(llmDispatcher.chatCompletion).not.toHaveBeenCalled();
    },
  );

  it('drafts a plan and does not call any tool when the thread mode is plan', async () => {
    agentThreadsService.findOne.mockResolvedValue({ mode: 'plan' });

    const result = await service.tryHandlePlanModeTurn(
      baseParams as never,
      host,
    );

    expect(result).not.toBeNull();
    expect(result?.toolCalls).toEqual([]);
    expect(llmDispatcher.chatCompletion).toHaveBeenCalledTimes(1);
    expect(agentThreadsService.findOne).toHaveBeenCalledWith({
      id: threadId,
      organizationId,
    });
  });

  it('tells the planner to plan motion graphics as a coded visual project, not a provider video', async () => {
    agentThreadsService.findOne.mockResolvedValue({ mode: 'plan' });

    await service.tryHandlePlanModeTurn(baseParams as never, host);

    const [request] = llmDispatcher.chatCompletion.mock.calls[0];
    const instruction = request.messages[0].content as string;
    expect(instruction).toContain('quote_visual_code_generation');
    expect(instruction).toContain('generate_visual_code');
    expect(instruction).toContain('never as a provider video model');
  });

  it('stamps the drafted plan reply with the run that produced it', async () => {
    agentThreadsService.findOne.mockResolvedValue({ mode: 'plan' });

    await service.tryHandlePlanModeTurn(
      {
        ...baseParams,
        context: { ...baseParams.context, executionId: 'run-1' },
      } as never,
      host,
    );

    expect(agentMessagesService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ runId: 'run-1' }),
      }),
    );
  });

  it('stamps the drafted plan with the time it was created so clients can order plans', async () => {
    const result = await service.generatePlanModeResponse(baseParams, host);

    const plan = result.message.metadata?.proposedPlan as {
      createdAt: string;
      id: string;
      updatedAt: string;
    };
    expect(plan.id).toMatch(/^plan-\d+$/);
    expect(plan.createdAt).toBe(
      new Date(Number(plan.id.slice('plan-'.length))).toISOString(),
    );
    expect(plan.updatedAt).toBe(plan.createdAt);
    expect(agentMessagesService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          proposedPlan: expect.objectContaining({
            createdAt: plan.createdAt,
            id: plan.id,
          }),
        }),
      }),
    );
  });

  it('preserves review history in both the persisted and returned plan', async () => {
    const reviewMetadata = {
      lastReviewAction: 'request_changes' as const,
      revisionNote: 'Keep the original budget',
    };
    const result = await service.generatePlanModeResponse(
      { ...baseParams, reviewMetadata },
      host,
    );

    expect(result.message.metadata?.proposedPlan).toEqual(
      expect.objectContaining(reviewMetadata),
    );
    expect(agentMessagesService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          proposedPlan: expect.objectContaining(reviewMetadata),
        }),
      }),
    );
  });

  it('fails the turn instead of proposing a plan with nothing in it', async () => {
    agentThreadsService.findOne.mockResolvedValue({ mode: 'plan' });
    llmDispatcher.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: '  ' } }],
      model: 'test-model',
    });

    await expect(
      service.tryHandlePlanModeTurn(baseParams as never, host),
    ).rejects.toThrow('empty plan');

    expect(threadEventRecorder.recordPlanUpserted).not.toHaveBeenCalled();
    expect(agentMessagesService.addMessage).not.toHaveBeenCalled();
  });

  it('treats a thread with no mode field as not plan-enabled', async () => {
    agentThreadsService.findOne.mockResolvedValue({});

    const result = await service.tryHandlePlanModeTurn(
      baseParams as never,
      host,
    );

    expect(result).toBeNull();
  });

  it('the streaming variant gates on the same mode check', async () => {
    agentThreadsService.findOne.mockResolvedValue({ mode: 'manual' });

    const handled = await service.tryHandlePlanModeTurnStream(
      { ...baseParams, startedAt: new Date().toISOString() } as never,
      host,
    );

    expect(handled).toBe(false);
    expect(streamEffects.publishStreamDoneOnly).not.toHaveBeenCalled();
  });

  describe('asking before planning', () => {
    const questionReply = JSON.stringify({
      title: 'Launch video',
      question: {
        title: 'Where does it take place?',
        prompt: 'Where does the opening scene take place?',
        options: [
          { id: 'studio', label: 'In a studio' },
          { id: 'street', label: 'On the street', description: 'Outdoors' },
        ],
        recommendedOptionId: 'studio',
      },
    });

    it('lets the planner ask a question and does not propose a plan', async () => {
      llmDispatcher.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: questionReply } }],
        model: 'test-model',
      });

      const result = await service.generatePlanModeResponse(
        {
          ...baseParams,
          context: { ...baseParams.context, executionId: 'run-q1' },
        },
        host,
      );

      expect(result.message.content).toBe(
        'Where does the opening scene take place?',
      );
      expect(result.message.metadata).not.toHaveProperty('proposedPlan');
      expect(result.message.metadata).not.toHaveProperty('reviewRequired');
      expect(result.message.metadata.planQuestionRequestId).toBe(
        'plan-question:run-q1',
      );
      expect(threadEventRecorder.recordPlanUpserted).not.toHaveBeenCalled();
      expect(streamEffects.publishStreamInputRequestEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          allowFreeText: true,
          inputRequestId: 'plan-question:run-q1',
          recommendedOptionId: 'studio',
          threadId,
          title: 'Where does it take place?',
          userId,
        }),
      );
    });

    it('plans instead when the question card is unusable', async () => {
      llmDispatcher.chatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                question: { prompt: 'Which one?', options: [] },
                summary: 'Plan drafted',
                content: 'Do the thing',
              }),
            },
          },
        ],
        model: 'test-model',
      });

      const result = await service.generatePlanModeResponse(baseParams, host);

      expect(result.message.metadata).toHaveProperty('proposedPlan');
      expect(
        streamEffects.publishStreamInputRequestEvent,
      ).not.toHaveBeenCalled();
    });

    it('tells the planner what to check for a video before it plans', async () => {
      await service.generatePlanModeResponse(baseParams, host);

      const [request] = llmDispatcher.chatCompletion.mock.calls[0];
      const instruction = request.messages[0].content as string;
      expect(instruction).toContain('ask one question instead of planning');
      expect(instruction).toContain('scene or setting');
      expect(instruction).not.toContain('Do not ask another one');
    });

    it('stops asking after three questions in a row and plans with assumptions', async () => {
      const asked = {
        metadata: { planQuestionRequestId: 'plan-question:run-x' },
        role: 'assistant',
      };
      contextService.resolveThreadMessages.mockResolvedValue({
        compressedContext: undefined,
        messages: [
          asked,
          { role: 'user' },
          asked,
          { role: 'user' },
          asked,
          { role: 'user' },
        ],
      });
      llmDispatcher.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: questionReply } }],
        model: 'test-model',
      });

      const result = await service.generatePlanModeResponse(baseParams, host);

      const [request] = llmDispatcher.chatCompletion.mock.calls[0];
      expect(request.messages[0].content).toContain('Do not ask another one');
      expect(result.message.metadata).toHaveProperty('proposedPlan');
      expect(
        (result.message.metadata.proposedPlan as { content: string }).content,
      ).toBe('Open question: Where does the opening scene take place?');
      expect(
        streamEffects.publishStreamInputRequestEvent,
      ).not.toHaveBeenCalled();
    });
  });
});
