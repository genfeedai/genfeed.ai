import {
  AGENT_AUTO_ROUTING_DEFAULT_MIN_CONFIDENCE,
  resolveAgentAutoRoutingDecisionConfig,
} from '@api/services/agent-orchestrator/utils/agent-auto-routing-decision-config.util';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it } from 'vitest';

function configService(env: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
}

describe('resolveAgentAutoRoutingDecisionConfig', () => {
  it('defaults to off at the conservative threshold', () => {
    expect(resolveAgentAutoRoutingDecisionConfig(configService({}))).toEqual({
      minConfidence: AGENT_AUTO_ROUTING_DEFAULT_MIN_CONFIDENCE,
      mode: 'off',
    });
  });

  it('reads both rollout knobs', () => {
    expect(
      resolveAgentAutoRoutingDecisionConfig(
        configService({
          AGENT_AUTO_ROUTING_DECISION_MODE: 'live',
          AGENT_AUTO_ROUTING_MIN_CONFIDENCE: 0.6,
        }),
      ),
    ).toEqual({ minConfidence: 0.6, mode: 'live' });
    expect(
      resolveAgentAutoRoutingDecisionConfig(
        configService({ AGENT_AUTO_ROUTING_DECISION_MODE: 'shadow' }),
      ).mode,
    ).toBe('shadow');
  });

  it('treats an unrecognised or out-of-range value as the safe default', () => {
    expect(
      resolveAgentAutoRoutingDecisionConfig(
        configService({
          AGENT_AUTO_ROUTING_DECISION_MODE: 'LIVE',
          AGENT_AUTO_ROUTING_MIN_CONFIDENCE: 4,
        }),
      ),
    ).toEqual({
      minConfidence: AGENT_AUTO_ROUTING_DEFAULT_MIN_CONFIDENCE,
      mode: 'off',
    });
  });
});
