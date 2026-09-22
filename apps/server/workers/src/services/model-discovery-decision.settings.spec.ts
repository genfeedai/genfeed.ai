import type { ConfigService } from '@workers/config/config.service';
import {
  DEFAULT_MODEL_DISCOVERY_MIN_CONFIDENCE,
  MODEL_DISCOVERY_CATEGORY_DECISION_POINT,
  MODEL_DISCOVERY_DECISION_TIMEOUT_MS,
  resolveModelDiscoveryDecisionSettings,
} from '@workers/services/model-discovery-decision.settings';
import { describe, expect, it } from 'vitest';

function configWith(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('resolveModelDiscoveryDecisionSettings', () => {
  it('defaults to the deterministic path with the conservative threshold', () => {
    expect(resolveModelDiscoveryDecisionSettings(configWith({}))).toEqual({
      minConfidence: DEFAULT_MODEL_DISCOVERY_MIN_CONFIDENCE,
      mode: 'off',
    });
  });

  it('reads a configured mode and threshold', () => {
    expect(
      resolveModelDiscoveryDecisionSettings(
        configWith({
          MODEL_DISCOVERY_DECISION_MODE: 'live',
          MODEL_DISCOVERY_MIN_CONFIDENCE: 0.6,
        }),
      ),
    ).toEqual({ minConfidence: 0.6, mode: 'live' });
  });

  it('falls back to off for an unrecognised mode', () => {
    expect(
      resolveModelDiscoveryDecisionSettings(
        configWith({ MODEL_DISCOVERY_DECISION_MODE: 'LIVE' }),
      ).mode,
    ).toBe('off');
  });

  it.each([-0.1, 1.1, Number.NaN, 'nope'])(
    'falls back to the default threshold for %s',
    (value) => {
      expect(
        resolveModelDiscoveryDecisionSettings(
          configWith({ MODEL_DISCOVERY_MIN_CONFIDENCE: value }),
        ).minConfidence,
      ).toBe(DEFAULT_MODEL_DISCOVERY_MIN_CONFIDENCE);
    },
  );

  it('pins the telemetry key #4874 queries agreement by', () => {
    expect(MODEL_DISCOVERY_CATEGORY_DECISION_POINT).toBe(
      'model_discovery.category',
    );
  });

  it("uses the epic's async budget rather than the agent-turn default", () => {
    expect(MODEL_DISCOVERY_DECISION_TIMEOUT_MS).toBe(2_000);
  });
});
