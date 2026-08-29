export const PERSONAL_SETTINGS_ANCHOR = {
  APPEARANCE: 'appearance',
  EMAIL_NOTIFICATIONS: 'email-notifications',
  FEATURES: 'features',
  LANGUAGE: 'language',
  SETUP_CHECKLIST: 'setup-checklist',
} as const;

export type PersonalSettingsAnchor =
  (typeof PERSONAL_SETTINGS_ANCHOR)[keyof typeof PERSONAL_SETTINGS_ANCHOR];
