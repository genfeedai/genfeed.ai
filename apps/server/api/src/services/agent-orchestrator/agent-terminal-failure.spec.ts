vi.mock(
  '@api/services/agent-orchestrator/constants/agent-credit-costs.constant',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    AGENT_MAX_TOOL_ROUNDS: 0,
  }),
);

import { AgentOrchestratorBatchService } from './agent-orchestrator-batch.service';
import { AgentOrchestratorStreamLoopService } from './agent-orchestrator-stream-loop.service';

describe('background agent terminal failures', () => {
  it('throws at the round budget instead of allowing an old assistant message to complete the run', async () => {
    const effects = {
      publishStreamLifecycleStarted: vi.fn(),
      publishStreamFailure: vi.fn(),
    };
    const contextService = {
      buildMemoryEntriesForResponse: vi.fn().mockReturnValue([]),
      buildMemoryInfluenceMetadata: vi.fn().mockReturnValue({}),
      resolveThreadMessages: vi.fn().mockResolvedValue({ messages: [] }),
      buildMessageHistory: vi
        .fn()
        .mockReturnValue([{ role: 'assistant', content: 'An older answer' }]),
    };
    const service = new AgentOrchestratorStreamLoopService(
      { error: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { isBatchGenerationIntent: () => false } as never,
      contextService as never,
      {} as never,
      effects as never,
      { findOne: vi.fn().mockResolvedValue({ status: 'RUNNING' }) } as never,
    );
    await expect(
      service.runStreamLoop(
        {
          organizationId: 'org-1',
          userId: 'user-1',
          executionId: 'run-1',
          executionMode: 'background',
        },
        'thread-1',
        undefined,
        'model',
        0,
        {} as never,
        'standard' as never,
        [],
      ),
    ).rejects.toThrow('Agent exceeded maximum tool-calling rounds');
    expect(effects.publishStreamFailure).not.toHaveBeenCalled();
  });

  it('propagates failed batch execution to workflow finalization', async () => {
    const executor = {
      executeTool: vi
        .fn()
        .mockResolvedValue({ success: false, error: 'HTTP 429' }),
    };
    const recorder = {
      recordToolStarted: vi.fn(),
      recordToolCompleted: vi.fn(),
      recordRunCompleted: vi.fn(),
    };
    const effects = {
      publishStreamingToolStarted: vi.fn(),
      publishStreamingToolCompleted: vi.fn(),
      publishStreamErrorOnly: vi.fn(),
    };
    const service = new AgentOrchestratorBatchService(
      {} as never,
      {} as never,
      executor as never,
      {} as never,
      recorder as never,
      effects as never,
    );
    await expect(
      service.tryHandleBatchGenerationTurnStream(
        {
          context: {
            organizationId: 'org-1',
            userId: 'user-1',
            executionId: 'run-1',
            executionMode: 'background',
          },
          model: 'model',
          policy: { brandId: 'brand-1' } as never,
          requestContent: 'Generate 3 posts for instagram',
          seedTitle: '',
          startedAt: new Date().toISOString(),
          threadId: 'thread-1',
        },
        { maybeUpdateThreadTitle: vi.fn() },
      ),
    ).rejects.toThrow('HTTP 429');
    expect(executor.executeTool).toHaveBeenCalled();
    expect(recorder.recordRunCompleted).not.toHaveBeenCalled();
    expect(effects.publishStreamErrorOnly).not.toHaveBeenCalled();
  });
});
