export const PERSONAL_SETTINGS_ANCHOR = {
  APPEARANCE: 'appearance',
  CHAT_DEFAULTS: 'chat-defaults',
  EMAIL_NOTIFICATIONS: 'email-notifications',
  FEATURES: 'features',
  LANGUAGE: 'language',
  SETUP_CHECKLIST: 'setup-checklist',
} as const;

export type PersonalSettingsAnchor =
  (typeof PERSONAL_SETTINGS_ANCHOR)[keyof typeof PERSONAL_SETTINGS_ANCHOR];
