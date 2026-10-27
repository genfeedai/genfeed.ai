import { AgentKnowledgeCitationService } from '@api/services/agent-orchestrator/agent-knowledge-citation.service';
import { AgentOrchestratorSyncLoopService } from '@api/services/agent-orchestrator/agent-orchestrator-sync-loop.service';
import { AgentTurnRoundRunnerService } from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
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
                function: { name: 'get_brands', arguments: '{}' },
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
    finalizeKnowledgeCitations: vi.fn(async (content: string) => ({
      content,
      metadata: {},
    })),
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
    { isTurboRunIntent: vi.fn().mockReturnValue(false) } as never,
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

describe('final assistant persistence failure', () => {
  it('records the failed run and rethrows the original error when addMessage rejects', async () => {
    const { run, provider, messages, recorder } = setup();
    provider.chatCompletion.mockResolvedValue({
      id: 'reply',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      choices: [
        {
          message: { content: 'Done.', role: 'assistant', tool_calls: [] },
        },
      ],
    });
    const persistenceError = new Error('persist failed');
    messages.addMessage.mockRejectedValue(persistenceError);

    await expect(run(5)).rejects.toBe(persistenceError);

    expect(recorder.recordRunFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'persist failed',
        runId: 'approval-run',
        threadId: 'thread',
      }),
    );
    expect(recorder.recordRunCompleted).not.toHaveBeenCalled();
  });
});

describe('verified Knowledge citations in the final answer', () => {
  const shown = {
    excerpt: 'Plans start at $29 per month.',
    kind: 'TEXT',
    purpose: 'BRAND_TRUTH',
    relevance: 0.9,
    sourceId: 'source-1',
    title: 'Pricing',
    version: 1,
    versionId: 'version-1',
  };

  /** Routes the mocked runner's citation step through the real service. */
  function useRealCitations(
    runner: { finalizeKnowledgeCitations: ReturnType<typeof vi.fn> },
    verifier: object,
  ) {
    const real = new AgentTurnRoundRunnerService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new AgentKnowledgeCitationService(
        verifier as never,
        { findOpenForVersions: async () => [] } as never,
      ),
    );
    runner.finalizeKnowledgeCitations.mockImplementation(
      (...args: Parameters<typeof real.finalizeKnowledgeCitations>) =>
        real.finalizeKnowledgeCitations(...args),
    );
  }

  function finalAnswer(content: string) {
    return {
      id: 'reply',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      choices: [{ message: { content, role: 'assistant', tool_calls: [] } }],
    };
  }

  it('numbers a source the user may still read and persists it with the answer', async () => {
    const verifier = {
      revalidate: vi.fn(async (_actor: unknown, r: object) => r),
    };
    const { run, provider, runner } = setup();
    useRealCitations(runner, verifier);
    runner.executeToolRound.mockImplementation(async ({ state }) => {
      state.knowledgePassages = new Map([['p1', { receipt: shown }]]);
      return { isCancelled: false };
    });
    provider.chatCompletion
      .mockResolvedValueOnce({
        id: 'search',
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
                  function: { name: 'search_knowledge', arguments: '{}' },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce(finalAnswer('Starter is $29 [[cite:p1]].'));

    const result = await run(50);

    expect(result.message.content).toBe('Starter is $29 [1].');
    expect(result.message.metadata.knowledgeCitations).toEqual({
      citations: [{ marker: 1, receipt: shown }],
      unsupportedCount: 0,
    });
  });

  it('leaves an answer with no markers and no citation metadata alone', async () => {
    const { run, provider, runner } = setup();
    useRealCitations(runner, { revalidate: vi.fn() });
    provider.chatCompletion.mockResolvedValue(finalAnswer('Nothing cited.'));

    const result = await run(50);

    expect(result.message.content).toBe('Nothing cited.');
    expect(result.message.metadata).not.toHaveProperty('knowledgeCitations');
  });
});

describe('announced drafts that were never written', () => {
  function reply(content: string) {
    return {
      id: 'reply',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      choices: [{ message: { content, role: 'assistant', tool_calls: [] } }],
    };
  }
  const draftText = [
    'Here are the drafts:',
    '1. Season it twice, wipe it never soak it, and it will outlast you.',
    '2. Your skillet is not dirty, it is seasoned. Stop scrubbing it clean.',
  ].join('\n');

  it('asks once for the drafts and answers with the ones it writes', async () => {
    const { run, provider } = setup();
    provider.chatCompletion
      .mockResolvedValueOnce(reply('Three drafts are ready above.'))
      .mockResolvedValueOnce(reply(draftText));

    const result = await run(50);

    expect(provider.chatCompletion).toHaveBeenCalledTimes(2);
    expect(result.message.content).toBe(draftText);
  });

  it('does not show the claim when the retry still writes nothing', async () => {
    const { run, provider } = setup();
    provider.chatCompletion.mockResolvedValue(
      reply('Three drafts are ready above.'),
    );

    const result = await run(50);

    expect(provider.chatCompletion).toHaveBeenCalledTimes(2);
    expect(result.message.content).not.toContain('are ready above');
    expect(result.message.content).toContain('have not written the drafts');
  });
});
