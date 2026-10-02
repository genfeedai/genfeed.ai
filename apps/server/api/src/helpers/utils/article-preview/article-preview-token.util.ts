import { createHmac, timingSafeEqual } from 'node:crypto';

/** Signed, expiring bearer tokens bound to both an article ID and its slug. */
const TOKEN_DOMAIN = 'article-preview:v2';
const TOKEN_VERSION = 'v2';
const ARTICLE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Preview links are meant to survive a review cycle, not to be permanent. */
export const ARTICLE_PREVIEW_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function sign(
  slug: string,
  articleId: string,
  expiresAt: number,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${TOKEN_DOMAIN}:${slug}:${articleId}:${expiresAt}`)
    .digest('base64url');
}

/** Return undefined when a signed link cannot be issued. */
export function createArticlePreviewToken(
  slug: string,
  articleId: string,
  secret: string | undefined,
  nowMs: number = Date.now(),
  ttlSeconds: number = ARTICLE_PREVIEW_TOKEN_TTL_SECONDS,
): string | undefined {
  if (!secret || !slug || !ARTICLE_ID_PATTERN.test(articleId)) return undefined;
  const expiresAt = Math.floor(nowMs / 1000) + ttlSeconds;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) return undefined;
  return `${TOKEN_VERSION}.${articleId}.${expiresAt}.${sign(slug, articleId, expiresAt, secret)}`;
}

/**
 * Return the verified article ID, or null for malformed, expired, or unsigned
 * input. Slug-only v1 links are deliberately rejected: regenerate old links.
 */
export function verifyArticlePreviewToken(
  token: string | undefined,
  slug: string,
  secret: string | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!token || !secret || !slug) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [version, articleId, expiresAtRaw, signature] = parts;
  if (
    version !== TOKEN_VERSION ||
    !articleId ||
    !ARTICLE_ID_PATTERN.test(articleId) ||
    !expiresAtRaw ||
    !signature
  )
    return null;
  const expiresAt = Number(expiresAtRaw);
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0 ||
    Math.floor(nowMs / 1000) > expiresAt
  )
    return null;
  const expected = Buffer.from(sign(slug, articleId, expiresAt, secret));
  const provided = Buffer.from(signature);
  return provided.length === expected.length &&
    timingSafeEqual(provided, expected)
    ? articleId
    : null;
}
