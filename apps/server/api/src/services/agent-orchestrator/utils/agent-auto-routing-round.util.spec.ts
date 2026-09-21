import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { resolveAgentAutoRoutingRound } from '@api/services/agent-orchestrator/utils/agent-auto-routing-round.util';

const context: AgentChatContext = {
  executionId: 'run-1',
  organizationId: 'org-1',
  scope: {
    brandId: 'brand-1',
    contextVersion: 2,
    isLegacyFallback: false,
    isVersionExplicit: true,
    organizationId: 'org-1',
    source: 'explicit',
    threadId: 'thread-1',
    userId: 'user-1',
  },
  userId: 'user-1',
};

function buildParams(overrides: Record<string, unknown> = {}) {
  return {
    context,
    hasPreviousRoundUsedTools: false,
    hasToolsAvailable: true,
    isTerminalRound: false,
    latestUserMessage: 'draft a launch post',
    model: 'openrouter/auto',
    modelRegistry: {
      getDefaultModelKey: vi.fn().mockResolvedValue('openrouter/auto'),
    },
    resolver: { resolve: vi.fn().mockResolvedValue({ mode: 'off' as const }) },
    roundNumber: 1,
    threadId: 'thread-1',
    ...overrides,
  };
}

describe('resolveAgentAutoRoutingRound', () => {
  it('asks the resolver with the round state and the platform default', async () => {
    const params = buildParams({
      resolver: {
        resolve: vi.fn().mockResolvedValue({
          candidateModelKey: 'anthropic/claude-sonnet-5',
          dispatchModelKey: 'anthropic/claude-sonnet-5',
          mode: 'live' as const,
        }),
      },
    });

    const round = await resolveAgentAutoRoutingRound(params);

    expect(params.resolver.resolve).toHaveBeenCalledWith({
      brandId: 'brand-1',
      defaultModelKey: 'openrouter/auto',
      hasPreviousRoundUsedTools: false,
      hasToolsAvailable: true,
      latestUserMessage: 'draft a launch post',
      model: 'openrouter/auto',
      organizationId: 'org-1',
      prioritize: undefined,
      roundNumber: 1,
      runId: 'run-1',
      source: undefined,
      threadId: 'thread-1',
      userId: 'user-1',
    });
    expect(round.defaultModelKey).toBe('openrouter/auto');
    expect(round.dispatchedModel).toBe('anthropic/claude-sonnet-5');
  });

  it('dispatches the requested model when no tier routed the round', async () => {
    const round = await resolveAgentAutoRoutingRound(
      buildParams({ model: 'anthropic/claude-opus-5' }),
    );

    expect(round.dispatchedModel).toBe('anthropic/claude-opus-5');
    expect(round.resolution).toEqual({ mode: 'off' });
  });

  it('keeps the previous resolution on a terminal round without deciding', async () => {
    const previous = {
      dispatchModelKey: 'anthropic/claude-sonnet-5',
      mode: 'live' as const,
    };
    const params = buildParams({ isTerminalRound: true, previous });

    const round = await resolveAgentAutoRoutingRound(params);

    expect(params.resolver.resolve).not.toHaveBeenCalled();
    expect(round.resolution).toBe(previous);
    expect(round.dispatchedModel).toBe('anthropic/claude-sonnet-5');
  });
});
