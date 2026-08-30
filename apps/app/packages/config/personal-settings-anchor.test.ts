import { describe, expect, it } from 'vitest';
import { PERSONAL_SETTINGS_ANCHOR } from './personal-settings-anchor';

describe('PERSONAL_SETTINGS_ANCHOR', () => {
  it('keeps the five personal settings card ids as string literals', () => {
    expect(PERSONAL_SETTINGS_ANCHOR).toEqual({
      APPEARANCE: 'appearance',
      EMAIL_NOTIFICATIONS: 'email-notifications',
      FEATURES: 'features',
      LANGUAGE: 'language',
      SETUP_CHECKLIST: 'setup-checklist',
    });
  });
});
