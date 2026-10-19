vi.mock(
  '@api/services/agent-orchestrator/constants/agent-credit-costs.constant',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    AGENT_MAX_TOOL_ROUNDS: 3,
  }),
);

import { AgentOrchestratorSyncLoopService } from '@api/services/agent-orchestrator/agent-orchestrator-sync-loop.service';
import {
  AGENT_WRAP_UP_INSTRUCTION,
  isAgentWrapUpRound,
} from '@api/services/agent-orchestrator/utils/agent-round-budget.util';
import { buildAgentChatCompletionParams } from '@api/services/agent-orchestrator/utils/agent-tool-definitions.util';
import { RouterPriority } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const TOOL_ROUND = {
  id: 'tool-round',
  usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
  choices: [
    {
      message: {
        content: '',
        role: 'assistant',
        tool_calls: [
          {
            function: { arguments: '{}', name: 'get_brands' },
            id: 'tool',
            type: 'function',
          },
        ],
      },
    },
  ],
};
const FINAL_ROUND = {
  id: 'final-round',
  usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
  choices: [
    {
      message: {
        content: 'Here is what I found.',
        role: 'assistant',
        tool_calls: [],
      },
    },
  ],
};

function setup(rounds: unknown[]) {
  const provider = { chatCompletion: vi.fn() };
  for (const round of rounds)
    provider.chatCompletion.mockResolvedValueOnce(round);
  const registry = {
    calculateRoundProviderCostUsd: vi.fn().mockResolvedValue(0.05),
    getAutoAllowedModelKeys: vi.fn().mockResolvedValue([]),
    getDefaultModelKey: vi.fn().mockResolvedValue('model'),
    getMaximumRoundCredits: vi.fn().mockResolvedValue(5),
    getRoundCredits: vi.fn().mockResolvedValue(5),
    toRoundCredits: vi.fn().mockReturnValue(5),
  };
  const credits = {
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(90),
    releaseReservation: vi.fn(),
    reserveCredits: vi.fn().mockResolvedValue({ id: 'reservation' }),
    settleReservation: vi.fn(),
  };
  const context = {
    buildMemoryEntriesForResponse: vi.fn().mockReturnValue([]),
    buildMemoryInfluenceMetadata: vi.fn().mockReturnValue({}),
    buildMessageHistory: vi.fn().mockReturnValue([]),
    resolveThreadMessages: vi
      .fn()
      .mockResolvedValue({ compressedContext: '', messages: [] }),
  };
  const runner = {
    executeToolRound: vi.fn().mockResolvedValue({ isCancelled: false }),
    recordAgentResponseModel: vi.fn().mockResolvedValue('model'),
  };
  const recorder = {
    recordAssistantFinalized: vi.fn(),
    recordRunCompleted: vi.fn(),
    recordRunFailed: vi.fn(),
    recordThreadTurnStarted: vi.fn(),
  };
  const service = new AgentOrchestratorSyncLoopService(
    provider as never,
    registry as never,
    {} as never,
    { addMessage: vi.fn() } as never,
    credits as never,
    runner as never,
    { isTurboRunIntent: vi.fn().mockReturnValue(false) } as never,
    context as never,
    {
      buildAssistantUiActions: vi
        .fn()
        .mockReturnValue({ suggestedActions: [], uiActions: [] }),
    } as never,
    recorder as never,
    { resolve: vi.fn() } as never,
  );
  const run = () =>
    service.executeSynchronousChatLoop({
      context: {
        creditBudget: 100,
        executionId: 'run-1',
        organizationId: 'org',
        userId: 'user',
      },
      generationPriority: RouterPriority.QUALITY,
      model: 'model',
      policy: {} as never,
      request: { content: 'Research this', source: 'proactive' },
      resolvedMemories: [],
      seedTitle: '',
      threadId: 'thread',
      turnCost: 5,
    });
  return { provider, recorder, run };
}

describe('agent round budget', () => {
  it('only the last allowed round is the wrap-up round', () => {
    expect(isAgentWrapUpRound(2, 3)).toBe(false);
    expect(isAgentWrapUpRound(3, 3)).toBe(true);
    expect(isAgentWrapUpRound(1, 0)).toBe(false);
  });

  it('forbids tool calls on the chat params when asked', () => {
    const base = {
      defaultModelKey: 'model',
      messages: [],
      model: 'model',
      prompt: 'hi',
      tools: [],
    };
    expect(buildAgentChatCompletionParams(base).tool_choice).toBe('auto');
    expect(
      buildAgentChatCompletionParams({ ...base, toolChoice: 'none' })
        .tool_choice,
    ).toBe('none');
  });

  it('ends a research-heavy turn with an answer instead of exceeding the budget', async () => {
    const { provider, recorder, run } = setup([
      TOOL_ROUND,
      TOOL_ROUND,
      FINAL_ROUND,
    ]);

    const result = await run();

    expect(result.message.content).toBe('Here is what I found.');
    expect(provider.chatCompletion).toHaveBeenCalledTimes(3);
    const toolChoices = provider.chatCompletion.mock.calls.map(
      ([params]) => params.tool_choice,
    );
    expect(toolChoices).toEqual(['auto', 'auto', 'none']);
    const wrapUpMessages = provider.chatCompletion.mock.calls[2][0].messages;
    expect(wrapUpMessages.at(-1)).toEqual({
      content: AGENT_WRAP_UP_INSTRUCTION,
      role: 'system',
    });
    expect(recorder.recordRunFailed).not.toHaveBeenCalled();
  });

  it('still fails when the provider keeps calling tools after the wrap-up', async () => {
    const { run } = setup([TOOL_ROUND, TOOL_ROUND, TOOL_ROUND]);
    await expect(run()).rejects.toThrow(
      'Agent exceeded maximum tool-calling rounds (3)',
    );
  });
});
