import { resolveModerationSettings } from '@api/services/moderation/moderation.settings';
import { ModerationCategory } from '@genfeedai/contracts';
import { DEFAULT_MODERATION_THRESHOLDS } from '@genfeedai/contracts/api-types/contracts';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';

describe('moderation settings', () => {
  it('keeps media on the host by default', () => {
    expect(
      resolveModerationSettings(DEFAULT_PLATFORM_FEATURE_SETTINGS),
    ).toEqual({
      mode: 'shadow',
      provider: 'none',
      thresholds: DEFAULT_MODERATION_THRESHOLDS,
    });
  });

  it('layers threshold overrides over the contract defaults', () => {
    const settings = resolveModerationSettings({
      ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
      moderationMode: 'live',
      moderationProvider: 'openai',
      moderationThresholds: {
        [ModerationCategory.SEXUAL]: 0.3,
        [ModerationCategory.VIOLENCE]: 0.9,
      },
    });
    expect(settings.mode).toBe('live');
    expect(settings.provider).toBe('openai');
    expect(settings.thresholds[ModerationCategory.SEXUAL]).toBe(0.3);
    expect(settings.thresholds[ModerationCategory.VIOLENCE]).toBe(0.9);
    expect(settings.thresholds[ModerationCategory.HATE]).toBe(0.5);
  });
});
