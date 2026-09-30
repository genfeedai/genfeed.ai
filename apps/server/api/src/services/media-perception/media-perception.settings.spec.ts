import { resolveMediaPerceptionSettings } from '@api/services/media-perception/media-perception.settings';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  LLM_DEFAULTS,
} from '@genfeedai/contracts/constants';

describe('resolveMediaPerceptionSettings', () => {
  it('defaults to enabled, six frames, a 24h lookback and the fast vision model', () => {
    expect(
      resolveMediaPerceptionSettings(DEFAULT_PLATFORM_FEATURE_SETTINGS),
    ).toEqual({
      frameCount: 6,
      isEnabled: true,
      lookbackHours: 24,
      visionModel: LLM_DEFAULTS.fastText,
    });
  });

  it('reads the operator platform settings', () => {
    expect(
      resolveMediaPerceptionSettings({
        ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
        isMediaPerceptionEnabled: false,
        mediaPerceptionFrameCount: 3,
        mediaPerceptionLookbackHours: 72,
        mediaPerceptionVisionModel: 'openrouter/vision',
      }),
    ).toEqual({
      frameCount: 3,
      isEnabled: false,
      lookbackHours: 72,
      visionModel: 'openrouter/vision',
    });
  });
});
