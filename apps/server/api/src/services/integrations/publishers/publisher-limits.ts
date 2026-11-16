import {
  type CredentialPlatform,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';

/** What one provider accepts from all Genfeed workers together. */
export interface PublisherLimit {
  /** Publishes in flight at once, across every worker process. */
  concurrency: number;
  /** Publishes started per rolling minute, across every worker process. */
  ratePerMinute: number;
}

/** A provider-specific ceiling, which must cite the page it comes from. */
export interface DocumentedPublisherLimit extends PublisherLimit {
  /** URL of the provider's API documentation stating the ceiling. */
  source: string;
}

/**
 * Applied to a provider with no entry in `PUBLISHER_LIMITS`. These are the
 * figures the whole scheduled-publish queue shared before limits were kept per
 * provider (8 at once, 120 a minute), so they are an existing choice, not a
 * provider's documented ceiling. They now apply to each provider on its own.
 */
export const DEFAULT_PUBLISHER_LIMIT: PublisherLimit = {
  concurrency: 8,
  ratePerMinute: 120,
};

/**
 * Per-provider ceilings, taken from the provider's current API documentation
 * and cited in `source`. Never add a value that is not documented: a provider
 * without an entry uses `DEFAULT_PUBLISHER_LIMIT`.
 *
 * The table is empty on purpose. The publish limits the providers document
 * today are per user, per access token or per account (X, TikTok, Reddit,
 * Instagram), while this ceiling counts publishes for every connected account
 * together. A per-account figure is not a per-app ceiling, and several of those
 * pages disagree with each other, so none was entered. The per-credential daily
 * quota is enforced separately and is unchanged.
 */
export const PUBLISHER_LIMITS: Readonly<
  Partial<Record<CredentialPlatform, DocumentedPublisherLimit>>
> = {};

/**
 * The key a post's platform is limited under: the domain platform when the
 * value is one (the database stores it upper-case), otherwise the lower-cased
 * value, so a platform with no publisher still gets one stable bucket.
 */
export function resolvePublishProvider(platform: string): string {
  return fromPrismaCredentialPlatform(platform) ?? platform.toLowerCase();
}

export function resolvePublisherLimit(provider: string): PublisherLimit {
  const entry = (
    PUBLISHER_LIMITS as Readonly<Record<string, DocumentedPublisherLimit>>
  )[provider];
  return entry
    ? { concurrency: entry.concurrency, ratePerMinute: entry.ratePerMinute }
    : DEFAULT_PUBLISHER_LIMIT;
}
