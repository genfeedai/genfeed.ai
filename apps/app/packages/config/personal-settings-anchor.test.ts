import { describe, expect, it } from 'vitest';
import { PERSONAL_SETTINGS_ANCHOR } from './personal-settings-anchor';

describe('PERSONAL_SETTINGS_ANCHOR', () => {
  it('keeps the six personal settings card ids as string literals', () => {
    expect(PERSONAL_SETTINGS_ANCHOR).toEqual({
      APPEARANCE: 'appearance',
      CHAT_DEFAULTS: 'chat-defaults',
      EMAIL_NOTIFICATIONS: 'email-notifications',
      FEATURES: 'features',
      LANGUAGE: 'language',
      SETUP_CHECKLIST: 'setup-checklist',
    });
  });
});
