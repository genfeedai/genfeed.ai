export const NEWSLETTER_STATUSES = [
  'proposed',
  'draft',
  'ready_for_review',
  'approved',
  'published',
  'archived',
] as const;

export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number];

export const NEWSLETTER_SOURCE_TYPES = [
  'url',
  'manual',
  'context',
  'newsletter',
] as const;

export type NewsletterSourceType = (typeof NEWSLETTER_SOURCE_TYPES)[number];
