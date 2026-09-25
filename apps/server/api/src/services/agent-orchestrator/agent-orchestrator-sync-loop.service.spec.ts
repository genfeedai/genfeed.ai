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
    getSettledRoundCredits: vi.fn().mockResolvedValue(5),
    getDefaultModelKey: vi.fn().mockResolvedValue('model'),
    getAutoAllowedModelKeys: vi.fn().mockResolvedValue([]),
  };
  const credits = {
    reserveCredits: vi.fn().mockResolvedValue({ id: 'reservation' }),
    settleReservation: vi.fn(),
    releaseReservation: vi.fn(),
  };
  const context = {
    resolveThreadMessages: vi
      .fn()
      .mockResolvedValue({ messages: [], compressedContext: '' }),
    buildMessageHistory: vi.fn().mockReturnValue([]),
  };
  const runner = {
    recordAgentResponseModel: vi.fn().mockResolvedValue('model'),
    executeToolRound: vi.fn().mockResolvedValue({ isCancelled: false }),
  };
  const routing = { resolve: vi.fn() };
  const service = new AgentOrchestratorSyncLoopService(
    provider as never,
    registry as never,
    {} as never,
    {} as never,
    credits as never,
    runner as never,
    {} as never,
    context as never,
    {} as never,
    { recordThreadTurnStarted: vi.fn(), recordRunFailed: vi.fn() } as never,
    routing as never,
  );
  const run = (creditBudget: number) =>
    service.executeSynchronousChatLoop({
      context: { organizationId: 'org', userId: 'user', creditBudget },
      threadId: 'thread',
      generationPriority: RouterPriority.QUALITY,
      model: 'model',
      policy: {} as never,
      request: { content: 'Draft this week', source: 'proactive' },
      resolvedMemories: [],
      seedTitle: '',
      turnCost: 5,
    });
  return { provider, credits, routing, runner, run };
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
