import * as vscode from 'vscode';

/**
 * Trusted API origins for the Genfeed.ai IDE extension.
 *
 * Workspace settings (e.g. .vscode/settings.json in a repo) can be controlled
 * by whoever authored the repo. Sending a bearer token to an untrusted origin
 * configured via a workspace setting is a token-exfiltration vulnerability.
 *
 * Any origin that is NOT in this set will be rejected — the default trusted
 * endpoint will be used instead and a warning shown to the user.
 */
export const TRUSTED_API_ORIGINS = new Set([
  'https://api.genfeed.ai',
  'https://app.genfeed.ai',
  'http://localhost:3010',
  'http://127.0.0.1:3010',
]);

const DEFAULT_API_ENDPOINT = 'https://api.genfeed.ai';

/**
 * Returns true when the given URL string uses a trusted origin.
 *
 * Rules:
 * - Must be parseable by `new URL()`.
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

  // Reject non-HTTPS except for explicit localhost/loopback development origins.
  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

  if (!isLocalhost && parsed.protocol !== 'https:') {
    return false;
  }

  return TRUSTED_API_ORIGINS.has(parsed.origin);
}

/**
 * Reads `genfeed.apiEndpoint` from VS Code workspace configuration and
 * validates it against the trusted-origins allowlist.
 *
 * If the configured value is not trusted, a warning notification is shown to
 * the user and the default endpoint (`https://api.genfeed.ai`) is returned
 * so that no bearer token is ever sent to an untrusted host.
 *
 * @returns A validated, trusted API base URL (no trailing slash).
 */
export function getValidatedApiEndpoint(): string {
  const config = vscode.workspace.getConfiguration('genfeed');
  const configured = config.get<string>('apiEndpoint', DEFAULT_API_ENDPOINT);

  if (configured === DEFAULT_API_ENDPOINT) {
    return DEFAULT_API_ENDPOINT;
  }

  if (isTrustedApiEndpoint(configured)) {
    return configured.replace(/\/$/, '');
  }

  vscode.window.showWarningMessage(
    `Genfeed: The workspace setting "genfeed.apiEndpoint" points to an ` +
      `untrusted origin (${configured}). ` +
      `Your credentials will NOT be sent there. ` +
      `Using the default endpoint instead. ` +
      `To use a custom endpoint, update your user settings (not workspace settings).`,
  );

  return DEFAULT_API_ENDPOINT;
}
