import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]{43}$/;

/**
 * Stateless capability tokens for newsletter links. Unsubscribe links must keep
 * working for as long as the email exists, so they are an HMAC over the
 * subject id instead of a stored, expiring secret. Each purpose is a separate
 * domain so a click token can never act as an unsubscribe token.
 */
export type NewsletterTokenPurpose = 'unsubscribe' | 'click';

function sign(
  secret: string,
  purpose: NewsletterTokenPurpose,
  subject: string,
) {
  return createHmac('sha256', secret)
    .update(`genfeed-newsletter:${purpose}:${subject}`)
    .digest('base64url');
}

export function createNewsletterToken(
  secret: string,
  purpose: NewsletterTokenPurpose,
  subject: string,
): string {
  if (!secret)
    throw new Error('Newsletter token signing key is not configured');
  return `${subject}.${sign(secret, purpose, subject)}`;
}

/** The subject the token was issued for, or null for any invalid token. */
export function readNewsletterToken(
  secret: string,
  purpose: NewsletterTokenPurpose,
  token: string,
): string | null {
  if (!secret || !TOKEN_PATTERN.test(token)) return null;
  const separator = token.lastIndexOf('.');
  const subject = token.slice(0, separator);
  const actual = Buffer.from(token.slice(separator + 1), 'base64url');
  const expected = Buffer.from(sign(secret, purpose, subject), 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected)
    ? subject
    : null;
}

/** One-way identity used for suppression and analytics, never the address. */
export function subscriberEmailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
