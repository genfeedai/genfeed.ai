import {
  PATTERN_ANALYZER_DEFAULT_MIN_CONFIDENCE,
  resolvePatternAnalyzerDecisionSettings,
} from '@api/collections/content-intelligence/services/pattern-analyzer-decision.config';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it } from 'vitest';

function makeConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('resolvePatternAnalyzerDecisionSettings', () => {
  it('defaults to shadow with the shipped confidence floor', () => {
    expect(
      resolvePatternAnalyzerDecisionSettings(makeConfigService({})),
    ).toEqual({
      minConfidence: PATTERN_ANALYZER_DEFAULT_MIN_CONFIDENCE,
      mode: 'shadow',
    });
  });

  it('caps a configured live mode at shadow', () => {
    expect(
      resolvePatternAnalyzerDecisionSettings(
        makeConfigService({
          PATTERN_ANALYZER_DECISION_MODE: 'live',
          PATTERN_ANALYZER_MIN_CONFIDENCE: 0.6,
        }),
      ),
    ).toEqual({ minConfidence: 0.6, mode: 'shadow' });
  });

  it('accepts shadow', () => {
    expect(
      resolvePatternAnalyzerDecisionSettings(
        makeConfigService({ PATTERN_ANALYZER_DECISION_MODE: ' shadow ' }),
      ).mode,
    ).toBe('shadow');
  });

  it('honours an explicit off', () => {
    expect(
      resolvePatternAnalyzerDecisionSettings(
        makeConfigService({ PATTERN_ANALYZER_DECISION_MODE: 'off' }),
      ).mode,
    ).toBe('off');
  });

  it('degrades an unreadable mode to shadow, never live', () => {
    expect(
      resolvePatternAnalyzerDecisionSettings(
        makeConfigService({ PATTERN_ANALYZER_DECISION_MODE: 'LIVE' }),
      ).mode,
    ).toBe('shadow');
  });

  it.each([-0.1, 1.5, Number.NaN, 'high'])(
    'falls back to the default floor for %s',
    (configured) => {
      expect(
        resolvePatternAnalyzerDecisionSettings(
          makeConfigService({ PATTERN_ANALYZER_MIN_CONFIDENCE: configured }),
        ).minConfidence,
      ).toBe(PATTERN_ANALYZER_DEFAULT_MIN_CONFIDENCE);
    },
  );

  it('keeps a zero floor, which accepts every answer the provider returns', () => {
    expect(
      resolvePatternAnalyzerDecisionSettings(
        makeConfigService({ PATTERN_ANALYZER_MIN_CONFIDENCE: 0 }),
      ).minConfidence,
    ).toBe(0);
  });
});
