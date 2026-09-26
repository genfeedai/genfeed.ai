import { resolveMediaPerceptionSettings } from '@api/services/media-perception/media-perception.settings';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type { ConfigService } from '@libs/config/config.service';

function configWith(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('resolveMediaPerceptionSettings', () => {
  it('defaults to enabled, six frames, a 24h lookback and the fast vision model', () => {
    expect(resolveMediaPerceptionSettings(configWith({}))).toEqual({
      frameCount: 6,
      isEnabled: true,
      lookbackHours: 24,
      visionModel: LLM_DEFAULTS.fastText,
    });
  });

  it('reads configured values', () => {
    expect(
      resolveMediaPerceptionSettings(
        configWith({
          MEDIA_PERCEPTION_ENABLED: 'false',
          MEDIA_PERCEPTION_FRAME_COUNT: 3,
          MEDIA_PERCEPTION_LOOKBACK_HOURS: 72,
          MEDIA_PERCEPTION_VISION_MODEL: ' openrouter/vision ',
        }),
      ),
    ).toEqual({
      frameCount: 3,
      isEnabled: false,
      lookbackHours: 72,
      visionModel: 'openrouter/vision',
    });
  });

  it('falls back to defaults for out-of-range values from a hand-built config', () => {
    const settings = resolveMediaPerceptionSettings(
      configWith({
        MEDIA_PERCEPTION_FRAME_COUNT: 99,
        MEDIA_PERCEPTION_LOOKBACK_HOURS: 0,
      }),
    );
    expect(settings.frameCount).toBe(6);
    expect(settings.lookbackHours).toBe(24);
  });
});
