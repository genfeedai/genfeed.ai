import { MCP_OAUTH_SESSION_KIND } from '@genfeedai/contracts/constants';

/**
 * Metadata stamped on the API key a remote MCP client receives as its OAuth
 * access token. `clientName` is the dynamically registered client name
 * ("Claude Code", "Codex", ...) so the web app can say which agent connected.
 */
export function buildMcpOAuthSessionMetadata(
  resource: string,
  clientName: string | null | undefined,
): Record<string, string> {
  const name = clientName?.trim();
  return {
    kind: MCP_OAUTH_SESSION_KIND,
    resource,
    ...(name ? { clientName: name } : {}),
  };
}

/** The client name a previous session key carried, kept across refresh rotation. */
export function readMcpOAuthClientName(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const clientName = (metadata as Record<string, unknown>).clientName;
  return typeof clientName === 'string' && clientName.length > 0
    ? clientName
    : undefined;
}
