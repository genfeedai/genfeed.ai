export const API_KEY_SCOPE_PRESETS = {
  content: [
    'videos:read',
    'videos:create',
    'images:read',
    'images:create',
    'prompts:read',
    'prompts:create',
    'articles:read',
    'articles:create',
    'brands:read',
    'posts:read',
    'posts:draft',
  ],
  full: [
    'videos:read',
    'videos:create',
    'videos:update',
    'videos:delete',
    'images:read',
    'images:create',
    'images:update',
    'images:delete',
    'prompts:read',
    'prompts:create',
    'prompts:update',
    'prompts:delete',
    'articles:read',
    'articles:create',
    'brands:read',
    'credits:read',
    'posts:read',
    'credentials:read',
    'posts:draft',
    'posts:schedule',
    'posts:approve',
    'posts:publish',
    'analytics:read',
  ],
  mcp: [
    'videos:read',
    'videos:create',
    'images:read',
    'images:create',
    'prompts:read',
    'prompts:create',
    'articles:read',
    'articles:create',
    'brands:read',
    'credits:read',
    'posts:draft',
    'posts:schedule',
    'posts:approve',
    'analytics:read',
  ],
  read: [
    'videos:read',
    'images:read',
    'prompts:read',
    'articles:read',
    'brands:read',
    'credits:read',
    'posts:read',
    'credentials:read',
    'analytics:read',
  ],
} as const satisfies Record<string, readonly string[]>;

/** Reserved API-key metadata field written only after server-side MCP verification. */
export const CONNECT_GENFEED_VERIFICATION_METADATA_KEY = 'connectGenfeed';

/** API-key `metadata.kind` of the session key minted by the MCP OAuth token exchange. */
export const MCP_OAUTH_SESSION_KIND = 'mcp-oauth-session';

/** API-key `metadata.kind` of a partner key minted by a platform admin. */
export const PARTNER_API_KEY_KIND = 'partner';

/**
 * API-key metadata: the only brands this key may reach (#9130). Absent means
 * every brand in the key's organization, new brands included. Written only
 * from a validated `allowedBrandIds` field, never from caller metadata.
 */
export const API_KEY_ALLOWED_BRANDS_METADATA_KEY = 'allowedBrandIds';

/** Most brands one key can be narrowed to. */
export const API_KEY_ALLOWED_BRANDS_MAX = 50;

/**
 * The brand allowlist stored on a key's metadata, or `undefined` for a key
 * that reaches every brand. A malformed value reads as an empty list, so a
 * corrupted restriction fails closed instead of widening the key.
 */
export function readApiKeyAllowedBrandIds(
  metadata: unknown,
): string[] | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>)[
    API_KEY_ALLOWED_BRANDS_METADATA_KEY
  ];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (brandId): brandId is string =>
      typeof brandId === 'string' && brandId.length > 0,
  );
}

/**
 * The brand limit as metadata to carry onto an updated key (#9130); empty for
 * a key without one.
 */
export function apiKeyAllowedBrandsMetadata(
  metadata: unknown,
): Record<string, string[]> {
  const allowedBrandIds = readApiKeyAllowedBrandIds(metadata);
  return allowedBrandIds
    ? { [API_KEY_ALLOWED_BRANDS_METADATA_KEY]: allowedBrandIds }
    : {};
}

export const MCP_ACCESS_MODE_METADATA_KEY = 'mcpAccessMode';
/** Session-key metadata: the user allowed organization switching at consent. */
export const MCP_CAN_SWITCH_ORGANIZATIONS_METADATA_KEY =
  'canSwitchOrganizations';
/**
 * Request header an MCP session that may switch organizations sends to act in
 * one of its user's other organizations for a single call, without moving the
 * connection. Honoured only after a live membership check.
 */
export const MCP_ORGANIZATION_HEADER = 'x-genfeed-organization';
/** Session-key metadata: the organization the connection is currently in. */
export const MCP_ACTIVE_ORGANIZATION_METADATA_KEY = 'activeOrganizationId';
export const MCP_CLAUDE_SCOPE_CEILING: readonly string[] =
  API_KEY_SCOPE_PRESETS.mcp.filter(
    (scope) =>
      !['images:create', 'videos:create', 'prompts:create'].includes(scope),
  );

export type ApiKeyScopePreset = keyof typeof API_KEY_SCOPE_PRESETS;
export type ApiKeyScopePresetValue =
  (typeof API_KEY_SCOPE_PRESETS)[ApiKeyScopePreset][number];

/**
 * Scopes a user may request when creating an API key through the public
 * endpoint — the union of every preset. Deliberately excludes privileged
 * scopes (e.g. `admin`, `credits:provision`, `managed-inference:execute`) and
 * any wildcard: those are reserved for managed/system keys minted server-side,
 * never self-service. Used by CreateApiKeyDto to reject out-of-preset scopes at
 * the request boundary.
 */
export const SELF_SERVICE_API_KEY_SCOPES: readonly string[] = Array.from(
  new Set(Object.values(API_KEY_SCOPE_PRESETS).flat()),
);
