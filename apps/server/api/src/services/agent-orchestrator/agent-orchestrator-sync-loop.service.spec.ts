import { AgentOrchestratorSyncLoopService } from '@api/services/agent-orchestrator/agent-orchestrator-sync-loop.service';
import { RouterPriority } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

function setup() {
  const provider = {
    chatCompletion: vi.fn().mockResolvedValue({
      id: 'reply',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      choices: [
        {
          message: {
            content: '',
            role: 'assistant',
            tool_calls: [
              {
                id: 'tool',
                type: 'function',
                function: { name: 'get_brand', arguments: '{}' },
              },
            ],
          },
        },
      ],
    }),
  };
  const registry = {
    getMaximumRoundCredits: vi.fn().mockResolvedValue(5),
    getRoundCredits: vi.fn().mockResolvedValue(5),
    calculateRoundProviderCostUsd: vi.fn().mockResolvedValue(0.05),
    toRoundCredits: vi.fn().mockReturnValue(5),
    getDefaultModelKey: vi.fn().mockResolvedValue('model'),
    getAutoAllowedModelKeys: vi.fn().mockResolvedValue([]),
  };
  const credits = {
    reserveCredits: vi.fn().mockResolvedValue({ id: 'reservation' }),
    settleReservation: vi.fn(),
    releaseReservation: vi.fn(),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(90),
  };
  const context = {
    resolveThreadMessages: vi
      .fn()
      .mockResolvedValue({ messages: [], compressedContext: '' }),
    buildMessageHistory: vi.fn().mockReturnValue([]),
    buildMemoryEntriesForResponse: vi.fn().mockReturnValue([]),
    buildMemoryInfluenceMetadata: vi.fn().mockReturnValue({}),
  };
  const runner = {
    recordAgentResponseModel: vi.fn().mockResolvedValue('model'),
    executeToolRound: vi.fn().mockResolvedValue({ isCancelled: false }),
  };
  const routing = { resolve: vi.fn() };
  const messages = { addMessage: vi.fn() };
  const recorder = {
    recordThreadTurnStarted: vi.fn(),
    recordRunFailed: vi.fn(),
    recordAssistantFinalized: vi.fn(),
    recordRunCompleted: vi.fn(),
  };
  const service = new AgentOrchestratorSyncLoopService(
    provider as never,
    registry as never,
    {} as never,
    messages as never,
    credits as never,
    runner as never,
    { isBatchGenerationIntent: vi.fn().mockReturnValue(false) } as never,
    context as never,
    {
      buildAssistantUiActions: vi.fn().mockReturnValue({
        uiActions: [],
        suggestedActions: [],
      }),
    } as never,
    recorder as never,
    routing as never,
  );
  const run = (creditBudget: number, approvedPlan?: Record<string, unknown>) =>
    service.executeSynchronousChatLoop({
      approvedPlan,
      context: {
        organizationId: 'org',
        userId: 'user',
        creditBudget,
        executionId: 'approval-run',
      },
      threadId: 'thread',
      generationPriority: RouterPriority.QUALITY,
      model: 'model',
      policy: {} as never,
      request: { content: 'Draft this week', source: 'proactive' },
      resolvedMemories: [],
      seedTitle: '',
      turnCost: 5,
    });
  return { provider, credits, routing, runner, run, messages, recorder };
}

describe('LLM round credit caps', () => {
  it('rejects an unaffordable first round before routing, reservation, or provider calls', async () => {
    const { run, provider, credits, routing } = setup();
    await expect(run(4)).rejects.toThrow('credit budget');
    expect(provider.chatCompletion).not.toHaveBeenCalled();
    expect(routing.resolve).not.toHaveBeenCalled();
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });
  it('allows an exact-cap round and blocks the next round using cumulative consumption', async () => {
    const { run, provider, credits, runner } = setup();
    await expect(run(5)).rejects.toThrow('credit budget');
    expect(provider.chatCompletion).toHaveBeenCalledOnce();
    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 5 }),
    );
    expect(runner.executeToolRound).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({ totalCreditsUsed: 5 }),
      }),
    );
  });
});

describe('approved plan recovery metadata', () => {
  it('persists the approved plan with its run before publishing completion', async () => {
    const { run, provider, messages, recorder } = setup();
    provider.chatCompletion.mockResolvedValue({
      id: 'reply',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      choices: [
        {
          message: {
            content: 'Plan executed.',
            role: 'assistant',
            tool_calls: [],
          },
        },
      ],
    });
    const approvedPlan = {
      id: 'plan-1',
      content: 'Publish the draft',
      status: 'approved',
      awaitingApproval: false,
      lastReviewAction: 'approve',
      createdAt: '2026-09-28T09:00:00.000Z',
      updatedAt: '2026-09-28T09:01:00.000Z',
      approvedAt: '2026-09-28T09:01:00.000Z',
    };

    const result = await run(5, approvedPlan);

    expect(messages.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          proposedPlan: approvedPlan,
          runId: 'approval-run',
        }),
      }),
    );
    expect(recorder.recordAssistantFinalized).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ proposedPlan: approvedPlan }),
        runId: 'approval-run',
      }),
    );
    expect(result.message.metadata.proposedPlan).toEqual(approvedPlan);
    expect(messages.addMessage.mock.invocationCallOrder[0]).toBeLessThan(
      recorder.recordRunCompleted.mock.invocationCallOrder[0],
    );
  });
});
