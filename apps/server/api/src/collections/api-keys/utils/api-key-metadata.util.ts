import {
  API_KEY_ACTION_ORIGIN_METADATA_KEY,
  API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY,
} from '@genfeedai/contracts';
import {
  API_KEY_ALLOWED_BRANDS_METADATA_KEY,
  CONNECT_GENFEED_VERIFICATION_METADATA_KEY,
} from '@genfeedai/contracts/constants';

function asMetadataRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

/**
 * Caller-supplied metadata without the keys only the server may write: the
 * action origin and its proof, the brand limit, Connect Genfeed verification
 * and the MCP OAuth session fields.
 */
export function withoutReservedMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }
  const {
    [API_KEY_ACTION_ORIGIN_METADATA_KEY]: _actionOrigin,
    [API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY]: _actionOriginProof,
    [API_KEY_ALLOWED_BRANDS_METADATA_KEY]: _allowedBrandIds,
    [CONNECT_GENFEED_VERIFICATION_METADATA_KEY]: _connectGenfeedVerification,
    kind: _kind,
    mcpAccessMode: _mcpAccessMode,
    resource: _resource,
    grantId: _grantId,
    clientName: _clientName,
    ...safeMetadata
  } = metadata;
  return safeMetadata;
}

/** A stored key's Connect Genfeed verification, carried onto an update. */
export function existingConnectGenfeedMetadata(
  metadata: unknown,
): Record<string, unknown> {
  const verification =
    asMetadataRecord(metadata)[CONNECT_GENFEED_VERIFICATION_METADATA_KEY];

  return verification &&
    typeof verification === 'object' &&
    !Array.isArray(verification)
    ? { [CONNECT_GENFEED_VERIFICATION_METADATA_KEY]: verification }
    : {};
}

/** A stored MCP OAuth session key's session fields, carried onto an update. */
export function existingMcpOAuthMetadata(
  metadata: unknown,
): Record<string, unknown> {
  const record = asMetadataRecord(metadata);
  if (record.kind !== 'mcp-oauth-session') return {};
  return {
    kind: record.kind,
    resource: record.resource,
    mcpAccessMode: record.mcpAccessMode,
    grantId: record.grantId,
    clientName: record.clientName,
  };
}
