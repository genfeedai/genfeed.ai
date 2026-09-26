import {
  parseModerationThresholds,
  resolveModerationSettings,
} from '@api/services/moderation/moderation.settings';
import { ModerationCategory } from '@genfeedai/contracts';
import { DEFAULT_MODERATION_THRESHOLDS } from '@genfeedai/contracts/api-types/contracts';
import type { ConfigService } from '@libs/config/config.service';

function configWith(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('moderation settings', () => {
  it('keeps media on the host by default', () => {
    expect(resolveModerationSettings(configWith({}))).toEqual({
      mode: 'shadow',
      provider: 'none',
      thresholds: DEFAULT_MODERATION_THRESHOLDS,
      unknownThresholdKeys: [],
    });
  });

  it('reads provider, mode and threshold overrides', () => {
    const settings = resolveModerationSettings(
      configWith({
        MODERATION_MODE: 'live',
        MODERATION_PROVIDER: 'openai',
        MODERATION_THRESHOLDS: 'sexual=0.3, violence = 0.9',
      }),
    );
    expect(settings.mode).toBe('live');
    expect(settings.provider).toBe('openai');
    expect(settings.thresholds[ModerationCategory.SEXUAL]).toBe(0.3);
    expect(settings.thresholds[ModerationCategory.VIOLENCE]).toBe(0.9);
    expect(settings.thresholds[ModerationCategory.HATE]).toBe(0.5);
  });

  it('reports unknown categories instead of keeping them', () => {
    expect(parseModerationThresholds('spooky=0.1,hate=0.4')).toEqual({
      thresholds: { ...DEFAULT_MODERATION_THRESHOLDS, hate: 0.4 },
      unknownKeys: ['spooky'],
    });
  });

  it('falls back to the safe provider and shadow mode for junk values', () => {
    const settings = resolveModerationSettings(
      configWith({ MODERATION_MODE: 'yolo', MODERATION_PROVIDER: 'acme' }),
    );
    expect(settings.provider).toBe('none');
    expect(settings.mode).toBe('shadow');
  });
});
