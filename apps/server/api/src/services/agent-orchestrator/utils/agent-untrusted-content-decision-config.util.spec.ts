import { resolveUntrustedContentDecisionConfig } from '@api/services/agent-orchestrator/utils/agent-untrusted-content-decision-config.util';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  parsePlatformFeatureSettings,
} from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

describe('resolveUntrustedContentDecisionConfig', () => {
  it('defaults to off at the 0.95 security threshold', () => {
    expect(
      resolveUntrustedContentDecisionConfig(DEFAULT_PLATFORM_FEATURE_SETTINGS),
    ).toEqual({ minConfidence: 0.95, mode: 'off' });
  });

  it('reads shadow mode and keeps a zero threshold', () => {
    expect(
      resolveUntrustedContentDecisionConfig({
        ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
        untrustedContentDecisionMode: 'shadow',
        untrustedContentMinConfidence: 0,
      }),
    ).toEqual({ minConfidence: 0, mode: 'shadow' });
  });

  it('rejects live even from a hand-edited row', () => {
    expect(
      resolveUntrustedContentDecisionConfig(
        parsePlatformFeatureSettings({
          untrustedContentDecisionMode: 'live',
          untrustedContentMinConfidence: 0.99,
        }),
      ),
    ).toEqual({ minConfidence: 0.99, mode: 'off' });
  });
});
