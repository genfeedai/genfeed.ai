import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { COMMUNITY_ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/community-onboarding-system-prompt.constant';
import { ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/onboarding-system-prompt.constant';
import type {
  AgentChatContext,
  AgentChatRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { afterEach, describe, expect, it, vi } from 'vitest';

const REQUEST: AgentChatRequest = {
  content: 'Start onboarding',
  source: 'onboarding',
};
const CONTEXT: AgentChatContext = {
  organizationId: 'organization-1',
  userId: 'user-1',
};

function createService(): AgentOrchestratorContextService {
  return new AgentOrchestratorContextService(
    {
      getLocalDefaultModelKey: vi.fn().mockResolvedValue('test-model'),
      resolveModelKey: vi.fn().mockResolvedValue('test-model'),
    } as never,
    {} as never,
    { findOne: vi.fn() } as never,
    {
      prepareForTurn: vi.fn().mockResolvedValue({
        existingScope: null,
        initialBrandId: undefined,
      }),
    } as never,
    {
      getFeedbackMemoriesForGeneration: vi.fn().mockResolvedValue([]),
    } as never,
    {} as never,
    { assembleContext: vi.fn().mockResolvedValue(null) } as never,
    { findOne: vi.fn().mockResolvedValue(null) } as never,
    { findOneById: vi.fn() } as never,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AgentOrchestratorContextService brand context layers (#3019)', () => {
  it('enables brandMemory + performancePatterns and leaves recentPosts/ragContext off for the main chat path', async () => {
    const assembleContext = vi.fn().mockResolvedValue(null);
    const service = new AgentOrchestratorContextService(
      {
        getLocalDefaultModelKey: vi.fn().mockResolvedValue('test-model'),
        resolveModelKey: vi.fn().mockResolvedValue('test-model'),
      } as never,
      {} as never,
      { findOne: vi.fn() } as never,
      {
        prepareForTurn: vi.fn().mockResolvedValue({
          existingScope: null,
          initialBrandId: undefined,
        }),
      } as never,
      {
        getFeedbackMemoriesForGeneration: vi.fn().mockResolvedValue([]),
      } as never,
      {} as never,
      { assembleContext } as never,
      { findOne: vi.fn().mockResolvedValue(null) } as never,
      { findOneById: vi.fn() } as never,
    );

    await service.resolveSystemPromptAndModel(
      { content: 'Draft a caption', source: 'agent' },
      CONTEXT,
    );

    // Every turn of the main conversational agent already carries message
    // history, compressed thread context, up to 8 feedback memories, skill
    // prompt sections, and page context — the tightest budget headroom of
    // the three #3019 call sites, and it fires on every single turn. Enable
    // brandMemory + performancePatterns (the feedback-blindness fix); leave
    // recentPosts/ragContext off so they don't compete with context the
    // thread already supplies, and because this call doesn't thread a
    // `query`, which would make ragContext an inert no-op.
    expect(assembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        layers: {
          brandGuidance: true,
          brandIdentity: true,
          brandMemory: true,
          performancePatterns: true,
        },
      }),
    );
  });
});

describe('AgentOrchestratorContextService onboarding prompt selection', () => {
  it('uses the Community prompt for self-hosted onboarding', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);

    const result = await createService().resolveSystemPromptAndModel(
      REQUEST,
      CONTEXT,
    );

    expect(result.systemPrompt).toBe(COMMUNITY_ONBOARDING_SYSTEM_PROMPT);
  });

  it('keeps the cloud onboarding prompt for SaaS', async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');

    const result = await createService().resolveSystemPromptAndModel(
      REQUEST,
      CONTEXT,
    );

    expect(result.systemPrompt).toBe(ONBOARDING_SYSTEM_PROMPT);
  });
});
