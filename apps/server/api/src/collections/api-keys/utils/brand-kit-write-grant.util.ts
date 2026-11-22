import { ActionOrigin, ApiKeyScope } from '@genfeedai/contracts';
import {
  MCP_CAN_SWITCH_ORGANIZATIONS_METADATA_KEY,
  MCP_OAUTH_SESSION_KIND,
} from '@genfeedai/contracts/constants';
import { resolveMcpAccessModeForResource } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import { BadRequestException } from '@nestjs/common';

type BrandKitWriteGrantInput = {
  allowedBrandIds?: string[];
  defaultBrandId?: string | null;
  metadata?: Record<string, unknown>;
  scopes: readonly string[];
};

/**
 * Brand Kit write permission is only ever granted to an MCP OAuth session for
 * one selected brand on the standard endpoint, never to a plain key.
 */
export function assertBrandKitWriteGrant(
  input: BrandKitWriteGrantInput,
  trustedOrigin?: ActionOrigin,
): void {
  if (!input.scopes.includes(ApiKeyScope.BRAND_KIT_WRITE)) {
    return;
  }
  const { allowedBrandIds, defaultBrandId, metadata } = input;
  if (
    trustedOrigin !== ActionOrigin.MCP ||
    metadata?.kind !== MCP_OAUTH_SESSION_KIND ||
    metadata.mcpAccessMode !== 'standard' ||
    typeof metadata.resource !== 'string' ||
    resolveMcpAccessModeForResource(metadata.resource) !== 'standard' ||
    metadata[MCP_CAN_SWITCH_ORGANIZATIONS_METADATA_KEY] === true ||
    allowedBrandIds?.length !== 1 ||
    defaultBrandId !== allowedBrandIds[0]
  ) {
    throw new BadRequestException(
      'Brand Kit write permission requires an OAuth grant for one selected brand',
    );
  }
}
