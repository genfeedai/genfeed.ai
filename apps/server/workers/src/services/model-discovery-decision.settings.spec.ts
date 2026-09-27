import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import {
  MODEL_DISCOVERY_CATEGORY_DECISION_POINT,
  MODEL_DISCOVERY_DECISION_TIMEOUT_MS,
  resolveModelDiscoveryDecisionSettings,
} from '@workers/services/model-discovery-decision.settings';
import { describe, expect, it } from 'vitest';

describe('resolveModelDiscoveryDecisionSettings', () => {
  it('defaults to the deterministic path with the conservative threshold', () => {
    expect(
      resolveModelDiscoveryDecisionSettings(DEFAULT_PLATFORM_FEATURE_SETTINGS),
    ).toEqual({ minConfidence: 0.85, mode: 'off' });
  });

  it('reads the operator mode and threshold', () => {
    expect(
      resolveModelDiscoveryDecisionSettings({
        ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
        modelDiscoveryDecisionMode: 'live',
        modelDiscoveryMinConfidence: 0.7,
      }),
    ).toEqual({ minConfidence: 0.7, mode: 'live' });
  });

  it('pins the telemetry key #4874 queries agreement by', () => {
    expect(MODEL_DISCOVERY_CATEGORY_DECISION_POINT).toBe(
      'model_discovery.category',
    );
  });

  it("uses the epic's async budget rather than the agent-turn default", () => {
    expect(MODEL_DISCOVERY_DECISION_TIMEOUT_MS).toBe(2_000);
  });
});
