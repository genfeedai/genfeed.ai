/** Editorial lifecycle of a newsletter issue (`Newsletter.status`). */
export const NEWSLETTER_STATUSES = [
  'proposed',
  'draft',
  'ready_for_review',
  'approved',
  'published',
  'archived',
] as const;

export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number];
