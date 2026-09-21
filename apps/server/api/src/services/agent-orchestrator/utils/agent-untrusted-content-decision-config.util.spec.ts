import {
  resolveUntrustedContentDecisionConfig,
  UNTRUSTED_CONTENT_DEFAULT_MIN_CONFIDENCE,
} from '@api/services/agent-orchestrator/utils/agent-untrusted-content-decision-config.util';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it } from 'vitest';

function buildConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('resolveUntrustedContentDecisionConfig', () => {
  it('defaults to off at the 0.95 security threshold', () => {
    expect(
      resolveUntrustedContentDecisionConfig(buildConfigService({})),
    ).toEqual({
      minConfidence: UNTRUSTED_CONTENT_DEFAULT_MIN_CONFIDENCE,
      mode: 'off',
    });
  });

  it('reads both validated keys', () => {
    expect(
      resolveUntrustedContentDecisionConfig(
        buildConfigService({
          UNTRUSTED_CONTENT_DECISION_MODE: 'live',
          UNTRUSTED_CONTENT_MIN_CONFIDENCE: 0.99,
        }),
      ),
    ).toEqual({ minConfidence: 0.99, mode: 'live' });
  });

  it('reads shadow mode', () => {
    expect(
      resolveUntrustedContentDecisionConfig(
        buildConfigService({ UNTRUSTED_CONTENT_DECISION_MODE: 'shadow' }),
      ).mode,
    ).toBe('shadow');
  });

  it('falls back to off on an unrecognised mode', () => {
    expect(
      resolveUntrustedContentDecisionConfig(
        buildConfigService({ UNTRUSTED_CONTENT_DECISION_MODE: 'LIVE' }),
      ).mode,
    ).toBe('off');
  });

  it('honours a configured zero threshold', () => {
    // Joi permits min(0). Zero means "withhold on any positive decision";
    // substituting the default would loosen a deliberate tightening.
    expect(
      resolveUntrustedContentDecisionConfig(
        buildConfigService({ UNTRUSTED_CONTENT_MIN_CONFIDENCE: 0 }),
      ).minConfidence,
    ).toBe(0);
  });

  it('falls back to the default threshold on an out-of-range confidence', () => {
    for (const value of [-1, 1.5, 'nonsense', undefined]) {
      expect(
        resolveUntrustedContentDecisionConfig(
          buildConfigService({ UNTRUSTED_CONTENT_MIN_CONFIDENCE: value }),
        ).minConfidence,
      ).toBe(UNTRUSTED_CONTENT_DEFAULT_MIN_CONFIDENCE);
    }
  });
});
