/**
 * Trusted API origins for the Genfeed.ai IDE extension.
 *
 * Workspace settings (e.g. .vscode/settings.json in a repo) can be controlled
 * by whoever authored the repo. Sending a bearer token to an untrusted origin
 * configured via a workspace setting is a token-exfiltration vulnerability.
 *
 * Any origin that is NOT in this set will be rejected.
 */
export const TRUSTED_API_ORIGINS = new Set([
  'https://api.genfeed.ai',
  'https://app.genfeed.ai',
  'http://localhost:3010',
  'http://127.0.0.1:3010',
]);

/**
 * Returns true when the given URL string uses a trusted origin.
 *
 * Rules:
 * - Must be parseable by `new URL()`.
 * - Embedded credentials are rejected.
 * - `https:` is required except for `localhost` / `127.0.0.1` (dev only).
 * - The origin (scheme + host + port) must be in TRUSTED_API_ORIGINS.
 */
export function isTrustedApiEndpoint(raw: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  if (parsed.username || parsed.password) {
    return false;
  }

  // Reject non-HTTPS except for explicit localhost/loopback development origins.
  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

  if (!isLocalhost && parsed.protocol !== 'https:') {
    return false;
  }

  return TRUSTED_API_ORIGINS.has(parsed.origin);
}
