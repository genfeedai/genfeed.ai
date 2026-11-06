export const NEWSLETTER_SOURCE_TYPES = [
  'url',
  'manual',
  'context',
  'newsletter',
] as const;

export type NewsletterSourceType = (typeof NEWSLETTER_SOURCE_TYPES)[number];
