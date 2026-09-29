import { resolveAgentAutoRoutingDecisionConfig } from '@api/services/agent-orchestrator/utils/agent-auto-routing-decision-config.util';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

describe('resolveAgentAutoRoutingDecisionConfig', () => {
  it('defaults to off', () => {
    expect(
      resolveAgentAutoRoutingDecisionConfig(DEFAULT_PLATFORM_FEATURE_SETTINGS),
    ).toEqual({ mode: 'off' });
  });
});
