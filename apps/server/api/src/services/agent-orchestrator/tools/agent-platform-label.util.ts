import { CredentialPlatform } from '@genfeedai/enums';

/** Legacy free-text alias users/models still emit for X/Twitter. */
const TWITTER_DISPLAY_ALIASES = new Set(['x']);

/**
 * Short display label for queue/tool cards.
 * Storage/API value is always {@link CredentialPlatform.TWITTER} (`twitter`);
 * `x` is accepted only as an input alias and rendered as `X`.
 */
export function formatAgentPlatformLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    normalized === CredentialPlatform.TWITTER ||
    TWITTER_DISPLAY_ALIASES.has(normalized)
  ) {
    return 'X';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function isTwitterPlatformId(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === CredentialPlatform.TWITTER ||
    TWITTER_DISPLAY_ALIASES.has(normalized)
  );
}
