import {
  buildAgentChatCompletionParams,
  buildToolDefinitions,
  CLOUD_ONLY_ONBOARDING_TOOLS,
  resolveBlockedTools,
} from '@api/services/agent-orchestrator/utils/agent-tool-definitions.util';
import type { CuratedActionName } from '@genfeedai/actions';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';

import { afterEach, describe, expect, it, vi } from 'vitest';

function resolveToolNames(source?: string): CuratedActionName[] {
  return buildToolDefinitions(undefined, resolveBlockedTools({ source })).map(
    (tool) => tool.function.name as CuratedActionName,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('self-hosted onboarding tool boundary', () => {
  it('defines payment and monthly content as cloud-only onboarding tools', () => {
    expect(CLOUD_ONLY_ONBOARDING_TOOLS).toEqual([
      'present_payment_options',
      'generate_monthly_content',
    ]);
  });

  it('blocks both cloud-only tools during self-hosted onboarding', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);

    const tools = resolveToolNames('onboarding');

    expect(tools).not.toContain('present_payment_options');
    expect(tools).not.toContain('generate_monthly_content');
  });

  it('makes presentPaymentOptions unreachable during self-hosted onboarding', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);

    expect(resolveToolNames('onboarding')).not.toContain(
      'present_payment_options',
    );
  });

  it('keeps both cloud-only tools during cloud onboarding', () => {
    vi.stubEnv('GENFEED_CLOUD', '1');

    const tools = resolveToolNames('onboarding');

    expect(tools).toContain('present_payment_options');
    expect(tools).toContain('generate_monthly_content');
  });

  it('blocks payment options on self-hosted non-onboarding turns too', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);

    const tools = resolveToolNames('agent');

    expect(tools).not.toContain('present_payment_options');
    expect(tools).toContain('generate_monthly_content');
  });

  it('does not block any tool on cloud non-onboarding turns', () => {
    vi.stubEnv('GENFEED_CLOUD', '1');

    const tools = resolveToolNames('agent');

    expect(resolveBlockedTools({ source: 'agent' })).toBeUndefined();
    expect(tools).toContain('present_payment_options');
    expect(tools).toContain('generate_monthly_content');
  });

  it('applies blocked tools after an allow-list', () => {
    const tools = buildToolDefinitions(
      ['present_payment_options', 'create_brand'],
      ['present_payment_options'],
    ).map((tool) => tool.function.name);

    expect(tools).toEqual(['create_brand']);
  });
});

describe('provider-compatible tool definitions', () => {
  const buildParams = (model: string) =>
    buildAgentChatCompletionParams({
      defaultModelKey: model,
      messages: [{ content: 'Hello', role: 'user' }],
      model,
      prompt: 'Hello',
      tools: buildToolDefinitions(),
    });

  it('removes keywords outside the Gemini function schema subset', () => {
    const params = buildParams('google/gemini-3.5-flash-lite');
    const serializedTools = JSON.stringify(params.tools);

    expect(serializedTools).not.toContain('"additionalProperties":');
    expect(serializedTools).not.toContain('"default":');
    expect(serializedTools).not.toContain('"maxItems":');
    expect(serializedTools).not.toContain('"maxLength":');
    expect(serializedTools).not.toContain('"maximum":');
    expect(serializedTools).not.toContain('"minimum":');
    expect(serializedTools).toContain('"anyOf":');
  });

  it('preserves canonical schemas for non-Gemini providers', () => {
    const tools = buildToolDefinitions();
    const params = buildAgentChatCompletionParams({
      defaultModelKey: 'anthropic/claude-sonnet-5',
      messages: [{ content: 'Hello', role: 'user' }],
      model: 'anthropic/claude-sonnet-5',
      prompt: 'Hello',
      tools,
    });

    expect(params.tools).toBe(tools);
    expect(JSON.stringify(params.tools)).toContain('additionalProperties');
  });
});

/** #4865: what the gateway receives in each rollout mode. */
describe('auto-routing request shape', () => {
  const autoKey = AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO;
  const buildAutoParams = (
    overrides: Partial<
      Parameters<typeof buildAgentChatCompletionParams>[0]
    > = {},
  ) =>
    buildAgentChatCompletionParams({
      autoAllowedModelKeys: ['vendor/cheap', 'vendor/reasoner'],
      defaultModelKey: autoKey,
      messages: [{ content: 'Hello', role: 'user' }],
      model: autoKey,
      prompt: 'Hello',
      sessionId: 'thread-1',
      tools: buildToolDefinitions(),
      ...overrides,
    });

  it('emits the gateway auto-router request when no key was decided', () => {
    const params = buildAutoParams();

    expect(params.model).toBe(autoKey);
    expect(params.plugins).toEqual([
      {
        allowed_models: ['vendor/cheap', 'vendor/reasoner'],
        cost_tier: 'medium',
        id: 'auto-router',
      },
    ]);
    expect(params).toMatchObject({ session_id: 'thread-1' });
  });

  it('dispatches a decided key with no auto-router plugin and no session id', () => {
    const params = buildAutoParams({ dispatchModelKey: 'vendor/reasoner' });

    expect(params.model).toBe('vendor/reasoner');
    expect(params.plugins).toBeUndefined();
    expect(params).not.toHaveProperty('session_id');
  });

  it('keeps the web plugin on a routed turn, judged on the requested model', () => {
    const params = buildAutoParams({
      dispatchModelKey: 'vendor/reasoner',
      isWebSearchNeeded: true,
    });

    expect(params.model).toBe('vendor/reasoner');
    expect(params.plugins).toEqual([{ id: 'web' }]);
  });

  it('drops the web plugin when the decision says the turn needs no live data', () => {
    const params = buildAutoParams({
      isWebSearchNeeded: false,
      prompt: 'what is trending in the creator economy today',
    });

    expect(params.plugins).toEqual([
      expect.objectContaining({ id: 'auto-router' }),
    ]);
  });
});
