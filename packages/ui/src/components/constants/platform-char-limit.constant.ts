import { CredentialPlatform, PostFormat } from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts';

/**
 * Caption limit shown when a channel has no entry in the capability catalog.
 * The catalog is the single source of truth for known channels — this only
 * keeps an unmapped channel from rendering a counter with no ceiling.
 */
export const DEFAULT_CHAR_LIMIT = 5000;

/**
 * X long-form (Premium) lifts the 280-character post limit. It is a post
 * format rather than a channel, so it cannot live in the capability catalog
 * keyed by platform.
 */
export const X_LONG_FORM_CHAR_LIMIT = 25_000;

/**
 * Resolve the caption limit the composer counts against for one channel.
 *
 * Reads `CHANNEL_CAPABILITIES` so the counter shown while typing is the same
 * number the publish path validates against in `BasePublisherService`.
 */
export function resolvePlatformCharLimit(
  platform: CredentialPlatform | string | undefined | null,
  format?: PostFormat | string,
): number {
  if (
    platform === CredentialPlatform.TWITTER &&
    format === PostFormat.LONG_FORM
  ) {
    return X_LONG_FORM_CHAR_LIMIT;
  }

  if (!platform) {
    return DEFAULT_CHAR_LIMIT;
  }

  return (
    getChannelCapability(platform)?.caption.maxLength ?? DEFAULT_CHAR_LIMIT
  );
}

/**
 * Human channel name for composer chrome, e.g. `LinkedIn` for `linkedin`.
 * Falls back to the raw platform value for channels outside the catalog.
 */
export function resolvePlatformLabel(
  platform: CredentialPlatform | string | undefined | null,
): string {
  if (!platform) {
    return '';
  }

  return getChannelCapability(platform)?.label ?? String(platform);
}
