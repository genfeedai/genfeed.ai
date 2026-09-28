import { resolvePatternAnalyzerDecisionSettings } from '@api/collections/content-intelligence/services/pattern-analyzer-decision.config';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  parsePlatformFeatureSettings,
} from '@genfeedai/contracts/constants';

describe('resolvePatternAnalyzerDecisionSettings', () => {
  it('defaults to shadow with the shipped confidence floor', () => {
    expect(
      resolvePatternAnalyzerDecisionSettings(DEFAULT_PLATFORM_FEATURE_SETTINGS),
    ).toEqual({ minConfidence: 0.85, mode: 'shadow' });
  });

  it('honours an explicit off and keeps a zero floor', () => {
    expect(
      resolvePatternAnalyzerDecisionSettings({
        ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
        patternAnalyzerDecisionMode: 'off',
        patternAnalyzerMinConfidence: 0,
      }),
    ).toEqual({ minConfidence: 0, mode: 'off' });
  });

  it('never resolves live, even from a hand-edited row', () => {
    expect(
      resolvePatternAnalyzerDecisionSettings(
        parsePlatformFeatureSettings({ patternAnalyzerDecisionMode: 'live' }),
      ).mode,
    ).toBe('shadow');
  });
});
