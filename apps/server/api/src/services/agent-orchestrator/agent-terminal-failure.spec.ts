import { delegateFindOneSelect } from '@api-test/mocks/service.mocks';

vi.mock(
  '@api/services/agent-orchestrator/constants/agent-credit-costs.constant',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    AGENT_MAX_TOOL_ROUNDS: 0,
  }),
);

import { AgentOrchestratorStreamLoopService } from './agent-orchestrator-stream-loop.service';
import { AgentOrchestratorTurboRunService } from './agent-orchestrator-turbo-run.service';

/** Stream effects that log each published event by name. */
function recordingEffects(names: string[]) {
  const published: string[] = [];
  const effects = Object.fromEntries(
    names.map((name) => [
      name,
      async () => {
        published.push(name);
      },
    ]),
  );
  return { effects, published };
}

describe('background agent terminal failures', () => {
  it('throws at the round budget instead of allowing an old assistant message to complete the run', async () => {
    const { effects, published } = recordingEffects([
      'publishStreamLifecycleStarted',
      'publishStreamFailure',
    ]);
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
      { isTurboRunIntent: () => false } as never,
      contextService as never,
      {} as never,
      effects as never,
      {
        findOne: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
        findOneSelect: delegateFindOneSelect(),
      } as never,
      // #4865 auto-routing resolver: `off` is the shipped default, so the
      // round keeps today's gateway request.
      { resolve: vi.fn().mockResolvedValue({ mode: 'off' }) } as never,
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
    expect(published).not.toContain('publishStreamFailure');
  });

  it('reads the real-token-streaming switch from platform settings (#5407)', async () => {
    const { effects } = recordingEffects([
      'publishStreamLifecycleStarted',
      'publishStreamFailure',
    ]);
    const contextService = {
      buildMemoryEntriesForResponse: vi.fn().mockReturnValue([]),
      buildMemoryInfluenceMetadata: vi.fn().mockReturnValue({}),
      resolveThreadMessages: vi.fn().mockResolvedValue({ messages: [] }),
      buildMessageHistory: vi
        .fn()
        .mockReturnValue([{ role: 'assistant', content: 'An older answer' }]),
    };
    const settingsReads: string[] = [];
    const getFeatureSettings = async () => {
      settingsReads.push('features');
      return { isAgentTokenStreamingEnabled: true };
    };
    const service = new AgentOrchestratorStreamLoopService(
      { error: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { isTurboRunIntent: () => false } as never,
      contextService as never,
      {} as never,
      effects as never,
      {
        findOne: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
        findOneSelect: delegateFindOneSelect(),
      } as never,
      { resolve: vi.fn().mockResolvedValue({ mode: 'off' }) } as never,
      undefined,
      { getFeatureSettings } as never,
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
    expect(settingsReads).not.toHaveLength(0);
  });

  it('propagates failed batch execution to workflow finalization', async () => {
    const executedTools: unknown[][] = [];
    const executor = {
      executeTool: async (...args: unknown[]) => {
        executedTools.push(args);
        return { success: false, error: 'HTTP 429' };
      },
    };
    const { effects: recorder, published: recorded } = recordingEffects([
      'recordToolStarted',
      'recordToolCompleted',
      'recordRunCompleted',
    ]);
    const { effects, published } = recordingEffects([
      'publishStreamingToolStarted',
      'publishStreamingToolCompleted',
      'publishStreamErrorOnly',
    ]);
    const service = new AgentOrchestratorTurboRunService(
      {} as never,
      {} as never,
      executor as never,
      {} as never,
      recorder as never,
      effects as never,
    );
    await expect(
      service.tryHandleTurboRunTurnStream(
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
    expect(executedTools).not.toHaveLength(0);
    expect(recorded).not.toContain('recordRunCompleted');
    expect(published).not.toContain('publishStreamErrorOnly');
  });
});
