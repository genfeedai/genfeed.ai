import { mostRestrictiveMcpAccessMode } from '@genfeedai/actions';
import {
  MCP_ACCESS_MODE_METADATA_KEY,
  MCP_OAUTH_SESSION_KIND,
} from '@genfeedai/contracts/constants';
import { resolveMcpAccessModeForResource } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import type { Prisma } from '@genfeedai/prisma';

/**
 * True for an OAuth session key minted for the standard `/mcp` endpoint. The
 * Claude connector and the admin endpoint are different grants: Claude stays
 * limited to assigned brands, and the admin endpoint already carries `admin`.
 * A session key without a recorded resource fails closed to the Claude limit.
 */
export function isStandardMcpOAuthSession(metadata: Prisma.JsonValue): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  if (metadata.kind !== MCP_OAUTH_SESSION_KIND) {
    return false;
  }
  const resource = metadata.resource;
  return (
    mostRestrictiveMcpAccessMode(
      metadata[MCP_ACCESS_MODE_METADATA_KEY],
      typeof resource === 'string'
        ? resolveMcpAccessModeForResource(resource)
        : 'claude',
    ) === 'standard'
  );
}
