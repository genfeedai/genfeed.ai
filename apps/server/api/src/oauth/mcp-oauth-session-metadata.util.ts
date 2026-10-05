import {
  type McpAccessMode,
  mostRestrictiveMcpAccessMode,
  parseMcpAccessMode,
} from '@genfeedai/actions';
import {
  MCP_ACCESS_MODE_METADATA_KEY,
  MCP_OAUTH_SESSION_KIND,
} from '@genfeedai/contracts/constants';
import { resolveMcpAccessModeForResource } from '@genfeedai/helpers/integrations/mcp-resource.helper';

/**
 * Identity of one OAuth consent, kept on every session key it produces.
 * `grantId` stays stable across refresh rotation (which mints a new key), so
 * the web app can tell a newly connected agent from an existing one renewing
 * its token. `clientName` is the dynamically registered client name
 * ("Claude Code", "Codex", ...).
 */
export type McpOAuthSessionLineage = {
  accessMode?: McpAccessMode;
  clientName?: string | null;
  grantId: string;
};

export function buildMcpOAuthSessionMetadata(
  resource: string,
  { accessMode, clientName, grantId }: McpOAuthSessionLineage,
): Record<string, string> {
  const name = clientName?.trim();
  return {
    [MCP_ACCESS_MODE_METADATA_KEY]: mostRestrictiveMcpAccessMode(
      accessMode,
      resolveMcpAccessModeForResource(resource),
    ),
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
  const readMetadataString = (key: string): string | undefined => {
    const value = record[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };

  return {
    accessMode: parseMcpAccessMode(record[MCP_ACCESS_MODE_METADATA_KEY]),
    clientName: readMetadataString('clientName'),
    grantId: readMetadataString('grantId') ?? fallbackGrantId,
  };
}
