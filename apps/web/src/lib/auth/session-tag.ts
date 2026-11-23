/**
 * A short fingerprint of the session cookie, readable by the page.
 *
 * The proxy sets it on every document response; the browser keeps what it drew
 * from a workspace under the tag it was written with, and draws it again only
 * while the tag in the cookie is the same. A different session (another user
 * on the same browser, a sign-in that happened without this app's code
 * running, an impersonation) has a different tag, so nothing of the old
 * session is drawn before the session read answers.
 *
 * The session token keeps its value for the life of the session: the server
 * extends `expiresAt` and signs the same token again (read in better-auth
 * 1.7, `api/routes/session.mjs`).
 *
 * The tag is the first 16 hex digits of a SHA-256 of the cookie value. That
 * is not enough to find the token and it names no user or organization.
 */
export const SESSION_TAG_COOKIE_NAME = 'genfeed_session_tag';

const TAG_HEX_DIGITS = 16;

export async function computeSessionTag(cookieValue: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(cookieValue),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, TAG_HEX_DIGITS);
}

/** The tag the proxy last set for this browser, or null (browser only). */
export function readSessionTag(): string | null {
  try {
    const prefix = `${SESSION_TAG_COOKIE_NAME}=`;
    for (const part of document.cookie.split(';')) {
      const entry = part.trim();
      if (entry.startsWith(prefix)) {
        return entry.slice(prefix.length) || null;
      }
    }
  } catch {
    // Cookies can be blocked; then nothing may be drawn early.
  }
  return null;
}
