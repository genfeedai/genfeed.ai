import { MCP_OAUTH_SESSION_KIND } from '@genfeedai/contracts/constants';

/**
 * Identity of one OAuth consent, kept on every session key it produces.
 * `grantId` stays stable across refresh rotation (which mints a new key), so
 * the web app can tell a newly connected agent from an existing one renewing
 * its token. `clientName` is the dynamically registered client name
 * ("Claude Code", "Codex", ...).
 */
export type McpOAuthSessionLineage = {
  clientName?: string | null;
  grantId: string;
};

export function buildMcpOAuthSessionMetadata(
  resource: string,
  { clientName, grantId }: McpOAuthSessionLineage,
): Record<string, string> {
  const name = clientName?.trim();
  return {
    grantId,
    kind: MCP_OAUTH_SESSION_KIND,
    resource,
    ...(name ? { clientName: name } : {}),
  };
}

/** The lineage a previous session key carried, kept across refresh rotation. */
export function readMcpOAuthSessionLineage(
  metadata: unknown,
  fallbackGrantId: string,
): McpOAuthSessionLineage {
  const record =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const readString = (key: string): string | undefined => {
    const value = record[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };

  return {
    clientName: readString('clientName'),
    grantId: readString('grantId') ?? fallbackGrantId,
  };
}
