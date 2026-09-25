import { resolveAgentAutoRoutingDecisionConfig } from '@api/services/agent-orchestrator/utils/agent-auto-routing-decision-config.util';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it } from 'vitest';

function configService(env: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
}

describe('resolveAgentAutoRoutingDecisionConfig', () => {
  it('defaults to off', () => {
    expect(resolveAgentAutoRoutingDecisionConfig(configService({}))).toEqual({
      mode: 'off',
    });
  });

  it('reads the configured mode', () => {
    expect(
      resolveAgentAutoRoutingDecisionConfig(
        configService({ AGENT_AUTO_ROUTING_DECISION_MODE: 'live' }),
      ).mode,
    ).toBe('live');
    expect(
      resolveAgentAutoRoutingDecisionConfig(
        configService({ AGENT_AUTO_ROUTING_DECISION_MODE: 'shadow' }),
      ).mode,
    ).toBe('shadow');
  });

  it('treats an unrecognised value as the safe default', () => {
    expect(
      resolveAgentAutoRoutingDecisionConfig(
        configService({ AGENT_AUTO_ROUTING_DECISION_MODE: 'LIVE' }),
      ),
    ).toEqual({ mode: 'off' });
  });
});
