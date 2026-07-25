import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, expiring tokens that authorise reading an unpublished article through
 * the public articles endpoint.
 *
 * The preview surface is anonymous by design — reviewers open the link straight
 * from a notification, with no session against the website. The token is
 * therefore the only thing standing between a draft and the internet, so it is
 * bound to a single slug, carries its own expiry, and is verified in constant
 * time.
 *
 * The signing key is `TOKEN_ENCRYPTION_KEY`, domain-separated by
 * {@link TOKEN_DOMAIN} so a preview signature can never be replayed against
 * another consumer of the same key.
 */

const TOKEN_DOMAIN = 'article-preview:v1';
const TOKEN_VERSION = 'v1';

/** Preview links are meant to survive a review cycle, not to be permanent. */
export const ARTICLE_PREVIEW_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function sign(slug: string, expiresAt: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${TOKEN_DOMAIN}:${slug}:${expiresAt}`)
    .digest('base64url');
}

/**
 * Build a preview token for `slug`. Returns `undefined` when no signing key is
 * configured — callers then emit a plain public URL rather than a link that
 * cannot be verified.
 */
export function createArticlePreviewToken(
  slug: string,
  secret: string | undefined,
  nowMs: number = Date.now(),
  ttlSeconds: number = ARTICLE_PREVIEW_TOKEN_TTL_SECONDS,
): string | undefined {
  if (!secret || !slug) {
    return undefined;
  }

  const expiresAt = Math.floor(nowMs / 1000) + ttlSeconds;

  return `${TOKEN_VERSION}.${expiresAt}.${sign(slug, expiresAt, secret)}`;
}

/**
 * Verify a preview token against the slug being requested.
 *
 * Fails closed on every ambiguous input: no token, no configured key,
 * malformed token, wrong slug, expired, or a signature mismatch.
 */
export function verifyArticlePreviewToken(
  token: string | undefined,
  slug: string,
  secret: string | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!token || !secret || !slug) {
    return false;
  }

  const [version, expiresAtRaw, signature] = token.split('.');

  if (version !== TOKEN_VERSION || !expiresAtRaw || !signature) {
    return false;
  }

  const expiresAt = Number(expiresAtRaw);

  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    return false;
  }

  if (Math.floor(nowMs / 1000) > expiresAt) {
    return false;
  }

  const expected = Buffer.from(sign(slug, expiresAt, secret));
  const provided = Buffer.from(signature);

  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
