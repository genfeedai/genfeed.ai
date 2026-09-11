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
  let streamEffects: { publishStreamDoneOnly: ReturnType<typeof vi.fn> };
  let contextService: {
    resolveThreadMessages: ReturnType<typeof vi.fn>;
    buildMessageHistory: ReturnType<typeof vi.fn>;
  };
  let agentChatModelRegistry: {
    getDefaultModelKey: ReturnType<typeof vi.fn>;
    getRoundCredits: ReturnType<typeof vi.fn>;
    getMaximumRoundCredits: ReturnType<typeof vi.fn>;
    getAutoAllowedModelKeys: ReturnType<typeof vi.fn>;
  };
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
    streamEffects = { publishStreamDoneOnly: vi.fn() };
    contextService = {
      resolveThreadMessages: vi
        .fn()
        .mockResolvedValue({ messages: [], compressedContext: undefined }),
      buildMessageHistory: vi.fn().mockReturnValue([]),
    };
    agentChatModelRegistry = {
      getDefaultModelKey: vi.fn().mockResolvedValue('test-model'),
      getRoundCredits: vi.fn().mockReturnValue(1),
      getMaximumRoundCredits: vi.fn().mockResolvedValue(10),
      getAutoAllowedModelKeys: vi.fn().mockResolvedValue([]),
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
});
