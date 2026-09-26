import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
  getRuntimeAgentChatMarginMultiplier,
  setRuntimeAgentChatMarginMultiplier,
} from './agent-chat-margin';
import {
  getRuntimeMarginMultiplier,
  setRuntimeMarginMultiplier,
} from './plans-pricing';

describe('agent-chat runtime margin multiplier', () => {
  afterEach(() => {
    setRuntimeAgentChatMarginMultiplier(DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER);
  });

  it('defaults to 1.7 (70% markup on provider cost)', () => {
    expect(DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER).toBe(1.7);
    expect(getRuntimeAgentChatMarginMultiplier()).toBe(1.7);
  });

  it('is independent of the generation runtime multiplier', () => {
    const initialGeneration = getRuntimeMarginMultiplier();

    setRuntimeAgentChatMarginMultiplier(2.5);

    expect(getRuntimeAgentChatMarginMultiplier()).toBe(2.5);
    expect(getRuntimeMarginMultiplier()).toBe(initialGeneration);

    setRuntimeMarginMultiplier(5);

    expect(getRuntimeAgentChatMarginMultiplier()).toBe(2.5);
    expect(getRuntimeMarginMultiplier()).toBe(5);

    setRuntimeMarginMultiplier(initialGeneration);
  });

  it('falls back to the 1.7 default for invalid multipliers', () => {
    setRuntimeAgentChatMarginMultiplier(0);
    expect(getRuntimeAgentChatMarginMultiplier()).toBe(
      DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
    );

    setRuntimeAgentChatMarginMultiplier(Number.NaN);
    expect(getRuntimeAgentChatMarginMultiplier()).toBe(
      DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
    );

    setRuntimeAgentChatMarginMultiplier(-3);
    expect(getRuntimeAgentChatMarginMultiplier()).toBe(
      DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
    );
  });

  it('clamps to the shared MAX_MARGIN_MULTIPLIER cap', () => {
    setRuntimeAgentChatMarginMultiplier(999);
    expect(getRuntimeAgentChatMarginMultiplier()).toBe(10);
  });
});
