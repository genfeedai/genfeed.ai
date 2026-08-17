import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AGENT_ORCHESTRATOR_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/agent-orchestrator-system-prompt.constant';
import { AGENT_SCOPE_GUARDRAIL } from '@api/services/agent-orchestrator/constants/agent-scope-guardrail.constant';
import { BRAND_INTERVIEW_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/brand-interview-system-prompt.constant';
import { COMMUNITY_ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/community-onboarding-system-prompt.constant';
import { ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/onboarding-system-prompt.constant';
import type {
  AgentChatContext,
  AgentChatRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { AgentType } from '@genfeedai/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ONBOARDING_REQUEST: AgentChatRequest = {
  content: 'Start onboarding',
  source: 'onboarding',
};
const DEFAULT_REQUEST: AgentChatRequest = {
  content: 'Plan next week of posts',
};
const CONTEXT: AgentChatContext = {
  organizationId: 'organization-1',
  userId: 'user-1',
};
const THREAD_ID = 'c7a123456789012345678901';

function createService(options?: {
  brandContext?: { defaultModel?: string } | null;
  orgSettings?: { agentReplyStyle?: string } | null;
  thread?: { memoryEntryIds?: string[]; systemPrompt?: string } | null;
}): AgentOrchestratorContextService {
  return new AgentOrchestratorContextService(
    {
      getLocalDefaultModelKey: vi.fn().mockResolvedValue('test-model'),
      resolveModelKey: vi.fn().mockResolvedValue('test-model'),
    } as never,
    {} as never,
    { findOne: vi.fn().mockResolvedValue(options?.thread ?? null) } as never,
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
    {
      assembleContext: vi.fn().mockResolvedValue(options?.brandContext ?? null),
      buildSystemPrompt: vi.fn(
        (basePrompt: string) => `assembled:${basePrompt}`,
      ),
    } as never,
    {
      findOne: vi.fn().mockResolvedValue(options?.orgSettings ?? null),
    } as never,
    { findOneById: vi.fn() } as never,
  );
}

function expectSharedScopeGuardrail(systemPrompt: string | undefined): void {
  expect(systemPrompt).toEqual(expect.stringContaining(AGENT_SCOPE_GUARDRAIL));
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
      ONBOARDING_REQUEST,
      CONTEXT,
    );

    expect(result.systemPrompt).toEqual(
      expect.stringContaining(COMMUNITY_ONBOARDING_SYSTEM_PROMPT),
    );
    expectSharedScopeGuardrail(result.systemPrompt);
  });

  it('keeps the cloud onboarding prompt for SaaS', async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');

    const result = await createService().resolveSystemPromptAndModel(
      ONBOARDING_REQUEST,
      CONTEXT,
    );

    expect(result.systemPrompt).toEqual(
      expect.stringContaining(ONBOARDING_SYSTEM_PROMPT),
    );
    expectSharedScopeGuardrail(result.systemPrompt);
  });
});

describe('AgentOrchestratorContextService resolveSystemPromptAndModel scope guardrail', () => {
  it('keeps the shared scope block on brand-interview prompts', async () => {
    const result = await createService().resolveSystemPromptAndModel(
      {
        agentType: AgentType.BRAND_INTERVIEW,
        content: 'Interview my brand',
      },
      CONTEXT,
    );

    expect(result.systemPrompt).toEqual(
      expect.stringContaining(BRAND_INTERVIEW_SYSTEM_PROMPT),
    );
    expectSharedScopeGuardrail(result.systemPrompt);
  });

  it('appends the shared scope block to a thread-persisted system prompt', async () => {
    const result = await createService({
      thread: { systemPrompt: 'Thread-custom prompt' },
    }).resolveSystemPromptAndModel(
      { content: 'Write a post', threadId: THREAD_ID },
      CONTEXT,
    );

    expect(result.systemPrompt).toEqual(
      expect.stringContaining('Thread-custom prompt'),
    );
    expectSharedScopeGuardrail(result.systemPrompt);
  });

  it('appends the shared scope block to a request systemPromptOverride', async () => {
    const result = await createService().resolveSystemPromptAndModel(
      {
        content: 'Write a carousel',
        systemPromptOverride: 'Sub-agent spawn brief',
      },
      CONTEXT,
    );

    expect(result.systemPrompt).toEqual(
      expect.stringContaining('Sub-agent spawn brief'),
    );
    expectSharedScopeGuardrail(result.systemPrompt);
  });

  it('keeps the shared scope block on the default buildAgentSystemPrompt path', async () => {
    const result = await createService().resolveSystemPromptAndModel(
      {
        agentType: AgentType.X_CONTENT,
        content: 'Draft a thread',
      },
      CONTEXT,
    );

    expect(result.systemPrompt).toEqual(
      expect.stringContaining(
        AGENT_ORCHESTRATOR_SYSTEM_PROMPT.split('\n')[0] ?? '',
      ),
    );
    expect(result.systemPrompt).toEqual(
      expect.stringContaining('Specialization: X/Twitter Content Agent'),
    );
    expectSharedScopeGuardrail(result.systemPrompt);
  });

  it('keeps the shared scope block on the reply-style path', async () => {
    const result = await createService({
      orgSettings: { agentReplyStyle: 'concise' },
    }).resolveSystemPromptAndModel(DEFAULT_REQUEST, CONTEXT);

    expect(result.systemPrompt).toEqual(
      expect.stringContaining('## Reply Style'),
    );
    expectSharedScopeGuardrail(result.systemPrompt);
  });

  it('keeps the shared scope block on the brand-context assembly path', async () => {
    const result = await createService({
      brandContext: { defaultModel: 'test-model' },
    }).resolveSystemPromptAndModel(DEFAULT_REQUEST, CONTEXT);

    expect(result.systemPrompt).toEqual(expect.stringContaining('assembled:'));
    expectSharedScopeGuardrail(result.systemPrompt);
  });
});

describe('AgentOrchestratorContextService buildMessageHistory scope guardrail', () => {
  it('appends the shared scope block when history falls back to the base prompt', () => {
    const history = createService().buildMessageHistory([]);
    const systemContent = history[0]?.content;

    expect(history[0]?.role).toBe('system');
    expect(systemContent).toEqual(
      expect.stringContaining(
        AGENT_ORCHESTRATOR_SYSTEM_PROMPT.split('\n')[0] ?? '',
      ),
    );
    expect(systemContent).toEqual(
      expect.stringContaining(AGENT_SCOPE_GUARDRAIL),
    );
  });

  it('does not duplicate the shared scope block when the override already includes it', () => {
    const override = ['Custom override', AGENT_SCOPE_GUARDRAIL]
      .filter(Boolean)
      .join('\n\n');
    const history = createService().buildMessageHistory([], override);
    const systemContent = String(history[0]?.content);
    const first = systemContent.indexOf(AGENT_SCOPE_GUARDRAIL);
    const last = systemContent.lastIndexOf(AGENT_SCOPE_GUARDRAIL);

    expect(first).toBeGreaterThan(-1);
    expect(first).toBe(last);
  });
});
