/**
 * Newsletter module vocabulary (#9722). Statuses and sources are stored as
 * plain strings, so these lists are the single source of truth for them.
 */
export const BRAND_SUBSCRIBER_STATUSES = [
  'pending',
  'active',
  'unsubscribed',
  'bounced',
  'complained',
] as const;

export type BrandSubscriberStatus = (typeof BRAND_SUBSCRIBER_STATUSES)[number];

/** Statuses that never receive mail again and are never re-added by an import. */
export const BRAND_SUBSCRIBER_BLOCKED_STATUSES = [
  'unsubscribed',
  'bounced',
  'complained',
] as const satisfies readonly BrandSubscriberStatus[];

export const BRAND_SUBSCRIBER_SOURCES = [
  'profile',
  'article',
  'post',
  'homepage',
  'footer',
  'archive',
  'manual',
  'import',
] as const;

export type BrandSubscriberSource = (typeof BRAND_SUBSCRIBER_SOURCES)[number];

/** Sources a public (anonymous) subscribe form may claim. */
export const BRAND_SUBSCRIBER_PUBLIC_SOURCES = [
  'profile',
  'article',
  'post',
  'homepage',
  'footer',
  'archive',
] as const satisfies readonly BrandSubscriberSource[];

export type BrandSubscriberPublicSource =
  (typeof BRAND_SUBSCRIBER_PUBLIC_SOURCES)[number];

export const BRAND_SUBSCRIBER_CONSENT_METHODS = [
  'double_opt_in',
  'owner_attested',
] as const;

export type BrandSubscriberConsentMethod =
  (typeof BRAND_SUBSCRIBER_CONSENT_METHODS)[number];

export const NEWSLETTER_SEND_STATUSES = [
  'scheduled',
  'sending',
  'paused',
  'canceled',
  'completed',
  'failed',
] as const;

export type NewsletterSendStatus = (typeof NEWSLETTER_SEND_STATUSES)[number];

export const NEWSLETTER_SEND_ACTIONS = ['pause', 'resume', 'cancel'] as const;

export type NewsletterSendAction = (typeof NEWSLETTER_SEND_ACTIONS)[number];

export const NEWSLETTER_RECIPIENT_STATUSES = [
  'pending',
  'sent',
  'skipped',
  'failed',
] as const;

export type NewsletterRecipientStatus =
  (typeof NEWSLETTER_RECIPIENT_STATUSES)[number];

/** Who may read an issue in full (#9718). */
export const NEWSLETTER_ACCESS_LEVELS = [
  'public',
  'subscribers',
  'paid',
] as const;

export type NewsletterAccessLevel = (typeof NEWSLETTER_ACCESS_LEVELS)[number];

/** CSV import bounds: one request holds the whole file. */
export const BRAND_SUBSCRIBER_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const BRAND_SUBSCRIBER_IMPORT_MAX_ROWS = 50_000;
/** Addresses accepted by one "add by email" request. */
export const BRAND_SUBSCRIBER_ADD_MAX_EMAILS = 500;

/**
 * Cloud plan caps (runtime gate, only where organization billing applies).
 * Self-hosted deployments have no caps. `null` means unlimited.
 */
export const NEWSLETTER_PLAN_LIMITS = {
  free: { emailsPerMonth: 5_000, subscribers: 1_000 },
  paid: { emailsPerMonth: 1_000_000, subscribers: 100_000 },
} as const satisfies Record<
  'free' | 'paid',
  { emailsPerMonth: number | null; subscribers: number | null }
>;

export type NewsletterPlanKey = keyof typeof NEWSLETTER_PLAN_LIMITS;

/** Source tag on the "Sent with Genfeed" footer link, so its sign-ups count. */
export const NEWSLETTER_ATTRIBUTION_SOURCE = 'newsletter-footer';

export function isBrandSubscriberStatus(
  value: unknown,
): value is BrandSubscriberStatus {
  return (BRAND_SUBSCRIBER_STATUSES as readonly unknown[]).includes(value);
}

export function isNewsletterAccessLevel(
  value: unknown,
): value is NewsletterAccessLevel {
  return (NEWSLETTER_ACCESS_LEVELS as readonly unknown[]).includes(value);
}
