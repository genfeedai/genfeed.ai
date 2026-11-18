import { mostRestrictiveMcpAccessMode } from '@genfeedai/actions';
import {
  MCP_ACCESS_MODE_METADATA_KEY,
  MCP_OAUTH_SESSION_KIND,
} from '@genfeedai/contracts/constants';
import { resolveMcpAccessModeForResource } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import type { Prisma } from '@genfeedai/prisma';

const BRAND_VIEW_RECORDED_MODES: readonly unknown[] = [
  undefined,
  'standard',
  'claude',
];

function isParseableUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * True for an OAuth session key minted for the standard `/mcp` endpoint or the
 * Claude connector `/mcp/claude`, the two grants an organization owner or
 * admin connects to. Both stay without the `admin` scope; this only decides
 * whether their live membership row, not the brands assigned to them, sets
 * which brands they see. The admin endpoint already carries `admin`.
 *
 * A session key that records no resource, a resource that is not a URL, or an
 * access mode this code does not know fails closed to the assigned-brand view.
 */
export function isMembershipBrandViewMcpSession(
  metadata: Prisma.JsonValue,
): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  if (metadata.kind !== MCP_OAUTH_SESSION_KIND) {
    return false;
  }
  const resource = metadata.resource;
  const recordedMode = metadata[MCP_ACCESS_MODE_METADATA_KEY];
  if (
    typeof resource !== 'string' ||
    !isParseableUrl(resource) ||
    !BRAND_VIEW_RECORDED_MODES.includes(recordedMode)
  ) {
    return false;
  }
  const mode = mostRestrictiveMcpAccessMode(
    recordedMode,
    resolveMcpAccessModeForResource(resource),
  );
  return mode === 'standard' || mode === 'claude';
}
