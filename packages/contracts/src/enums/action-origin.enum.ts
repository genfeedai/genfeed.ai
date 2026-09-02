/**
 * Trusted initiating surface for consequential product actions.
 *
 * Values describe where an action entered Genfeed, not the implementation
 * layer that happened to execute it. Queued retries therefore retain the
 * original value instead of being reclassified as a worker action.
 */
export enum ActionOrigin {
  AGENT = 'agent',
  API = 'api',
  CLI = 'cli',
  MCP = 'mcp',
  UI = 'ui',
  UNKNOWN = 'unknown',
  WORKFLOW = 'workflow',
}

export interface ActionOriginContext {
  actorUserId?: string;
  apiKeyId?: string;
  origin: ActionOrigin;
}

/** Server-to-server proof header added only by the MCP adapter. */
export const MCP_ACTION_ORIGIN_PROOF_HEADER = 'x-genfeed-mcp-origin-proof';

/** Reserved API-key metadata field populated by trusted issuance paths. */
export const API_KEY_ACTION_ORIGIN_METADATA_KEY = 'actionOrigin';

/** Server signature paired with trusted API-key action-origin metadata. */
export const API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY = 'actionOriginProof';
