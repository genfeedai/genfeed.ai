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
 * Returns true when the endpoint was set in user-level (global) settings,
 * which cannot be repo-controlled and are therefore safe for self-hosted use.
 */
function isUserLevelSetting(): boolean {
  const config = vscode.workspace.getConfiguration('genfeed');
  const inspection = config.inspect<string>('apiEndpoint');
  return (
    inspection?.globalValue !== undefined ||
    inspection?.globalLanguageValue !== undefined
  );
}

/**
 * Reads `genfeed.apiEndpoint` from VS Code configuration and validates it.
 *
 * Workspace-level settings (controllable by repo authors) are restricted to
 * the hardcoded TRUSTED_API_ORIGINS allowlist to prevent token exfiltration.
 * User-level (global) settings are trusted — self-hosted deployments set
 * their custom API endpoint there.
 *
 * @returns A validated API base URL (no trailing slash).
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

  if (isUserLevelSetting()) {
    let parsed: URL;
    try {
      parsed = new URL(configured);
    } catch {
      vscode.window.showWarningMessage(
        `Genfeed: "genfeed.apiEndpoint" is not a valid URL (${configured}). Using default.`,
      );
      return DEFAULT_API_ENDPOINT;
    }

    const isLocalhost =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (!isLocalhost && parsed.protocol !== 'https:') {
      vscode.window.showWarningMessage(
        `Genfeed: "genfeed.apiEndpoint" must use HTTPS for non-localhost origins. Using default.`,
      );
      return DEFAULT_API_ENDPOINT;
    }

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
