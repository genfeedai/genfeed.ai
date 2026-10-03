import { describe, expect, it } from 'vitest';
import { legacyRuntimeSettings } from './platform-runtime-config.util';

describe('legacy runtime configuration import', () => {
  it('imports configured values while leaving absent settings untouched', () => {
    expect(
      legacyRuntimeSettings({
        MAX_TOKENS: '8000',
        TRAINING_CUSTOM_MODEL_CREDITS_COST: '0',
        RESEND_FROM_EMAIL: 'Genfeed <notifications@example.com>',
      }),
    ).toEqual({
      generationMaxTokens: 8000,
      customModelCreditsCost: 0,
      emailFromAddress: 'Genfeed <notifications@example.com>',
    });
  });
  it('rejects invalid settings instead of silently changing product behavior', () => {
    expect(() => legacyRuntimeSettings({ MAX_TOKENS: '-1' })).toThrow(
      'MAX_TOKENS',
    );
    expect(() =>
      legacyRuntimeSettings({ DISCORD_CHANNEL_ID_USERS: 'invalid' }),
    ).toThrow('DISCORD_CHANNEL_ID_USERS');
  });
});
