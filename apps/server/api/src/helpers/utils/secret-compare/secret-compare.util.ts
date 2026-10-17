import crypto from 'node:crypto';

/**
 * Constant-time comparison of a shared webhook secret with the value a caller
 * sent. An unset secret never matches: an open webhook would let anyone who
 * finds the URL inject events.
 */
export function isMatchingSecret(
  expectedSecret: string | undefined,
  providedSecret: string | undefined,
): boolean {
  if (!expectedSecret || !providedSecret) {
    return false;
  }

  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(providedSecret);

  return (
    expected.length === provided.length &&
    crypto.timingSafeEqual(expected, provided)
  );
}
