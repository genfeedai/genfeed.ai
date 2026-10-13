import { CredentialPlatform } from '..';

/**
 * Connected accounts an Article delivers to (#6753, #6764). Each one publishes
 * through its scheduler publisher; genfeed.ai itself is never a customer
 * delivery target. Dev.to receives Markdown converted from the stored HTML.
 */
export const ARTICLE_DELIVERY_PLATFORMS = [
  CredentialPlatform.GHOST,
  CredentialPlatform.WORDPRESS,
  CredentialPlatform.MEDIUM,
  CredentialPlatform.DEV_TO,
] as const;

/**
 * Connected accounts a Newsletter delivers to. Substack has no publishing API
 * (#2087); it imports published issues from the brand's newsletter feed.
 */
export const NEWSLETTER_DELIVERY_PLATFORMS = [
  CredentialPlatform.BEEHIIV,
] as const;

export type ArticleDeliveryPlatform =
  (typeof ARTICLE_DELIVERY_PLATFORMS)[number];
export type NewsletterDeliveryPlatform =
  (typeof NEWSLETTER_DELIVERY_PLATFORMS)[number];

/** How a Newsletter reaches Beehiiv: sent now, saved as a draft, or scheduled. */
export const NEWSLETTER_DELIVERY_MODES = ['send', 'draft', 'schedule'] as const;

export type NewsletterDeliveryMode = (typeof NEWSLETTER_DELIVERY_MODES)[number];

export function isArticleDeliveryPlatform(
  platform: string | null | undefined,
): platform is ArticleDeliveryPlatform {
  return (ARTICLE_DELIVERY_PLATFORMS as readonly string[]).includes(
    platform ?? '',
  );
}

export function isNewsletterDeliveryPlatform(
  platform: string | null | undefined,
): platform is NewsletterDeliveryPlatform {
  return (NEWSLETTER_DELIVERY_PLATFORMS as readonly string[]).includes(
    platform ?? '',
  );
}
