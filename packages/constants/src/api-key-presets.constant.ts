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
    'posts:create',
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
    'posts:create',
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
    'posts:create',
    'analytics:read',
  ],
  read: [
    'videos:read',
    'images:read',
    'prompts:read',
    'articles:read',
    'brands:read',
    'credits:read',
    'analytics:read',
  ],
} as const satisfies Record<string, readonly string[]>;

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
