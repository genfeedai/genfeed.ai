/**
 * Returns the URL only when it is plain http(s). Webview messages and API
 * payloads are untrusted, and `vscode.env.openExternal` also dispatches
 * `command:` and `file:` URIs.
 */
export function toExternalHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}
