import type {
  ApiKeyPermissionLevel,
  ApiKeyPermissionLevels,
  IApiKeyPermissionGroup,
  IApiKeyPermissionResource,
} from '../interfaces/core/api-key-permission.interface';
import { SELF_SERVICE_API_KEY_SCOPES } from './api-key-presets.constant';

/**
 * Every API key permission as a resource with none, read or write, in groups.
 * Stored scopes stay the flat strings in `ApiKeyScope`; this registry maps a
 * level per resource onto them, so keys need no migration. Privileged scopes
 * (`admin`, `credits:provision`, `managed-inference:execute`) are absent on
 * purpose: they are minted server-side only.
 */
export const API_KEY_PERMISSION_GROUPS: readonly IApiKeyPermissionGroup[] = [
  {
    id: 'content',
    label: 'Content',
    resources: [
      {
        id: 'videos',
        label: 'Videos',
        levels: ['none', 'read', 'write'],
        readScopes: ['videos:read'],
        writeScopes: ['videos:create', 'videos:update', 'videos:delete'],
      },
      {
        id: 'images',
        label: 'Images',
        levels: ['none', 'read', 'write'],
        readScopes: ['images:read'],
        writeScopes: ['images:create', 'images:update', 'images:delete'],
      },
      {
        id: 'prompts',
        label: 'Prompts',
        levels: ['none', 'read', 'write'],
        readScopes: ['prompts:read'],
        writeScopes: ['prompts:create', 'prompts:update', 'prompts:delete'],
      },
      {
        id: 'articles',
        label: 'Articles',
        levels: ['none', 'read', 'write'],
        readScopes: ['articles:read'],
        writeScopes: ['articles:create'],
      },
    ],
  },
  {
    id: 'publishing',
    label: 'Publishing',
    resources: [
      {
        id: 'post-drafts',
        label: 'Post drafts',
        levels: ['none', 'write'],
        readScopes: [],
        writeScopes: ['posts:draft'],
      },
      {
        id: 'post-scheduling',
        label: 'Post scheduling',
        levels: ['none', 'write'],
        readScopes: [],
        writeScopes: ['posts:schedule'],
      },
      {
        id: 'publish-approvals',
        label: 'Publish approvals',
        levels: ['none', 'write'],
        readScopes: [],
        writeScopes: ['posts:approve'],
      },
      {
        id: 'direct-publishing',
        label: 'Direct publishing',
        levels: ['none', 'write'],
        readScopes: [],
        writeScopes: ['posts:publish'],
      },
    ],
  },
  {
    id: 'brands',
    label: 'Brands',
    resources: [
      {
        id: 'brands',
        label: 'Brands and brand context',
        levels: ['none', 'read', 'write'],
        readScopes: ['brands:read'],
        writeScopes: ['brands:write'],
      },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    resources: [
      {
        id: 'analytics',
        label: 'Analytics',
        levels: ['none', 'read'],
        readScopes: ['analytics:read'],
        writeScopes: [],
      },
      {
        id: 'credits',
        label: 'Credits',
        levels: ['none', 'read'],
        readScopes: ['credits:read'],
        writeScopes: [],
      },
    ],
  },
];

const SELF_SERVICE_SCOPE_SET: ReadonlySet<string> = new Set(
  SELF_SERVICE_API_KEY_SCOPES,
);

/**
 * Partner keys for the first release: image generation plus brand context,
 * no posting and no social connect. Minted by a platform admin only, since
 * `brands:write` is not self-service.
 */
export const PARTNER_API_KEY_PERMISSION_LEVELS: ApiKeyPermissionLevels = {
  brands: 'write',
  images: 'write',
};

/** Scopes a level adds on top of `none`. `write` includes `read`. */
function scopesForLevel(
  resource: IApiKeyPermissionResource,
  level: ApiKeyPermissionLevel,
): readonly string[] {
  if (level === 'none') return [];
  if (level === 'read') return resource.readScopes;
  return [...resource.readScopes, ...resource.writeScopes];
}

/**
 * The levels a signed-in user may grant to their own key: a level is offered
 * only when every scope it grants is in the self-service list, so privileged
 * levels (Brands Write) stay admin-minted.
 */
export function getSelfServiceApiKeyPermissionLevels(
  resource: IApiKeyPermissionResource,
): ApiKeyPermissionLevel[] {
  return resource.levels.filter((level) =>
    scopesForLevel(resource, level).every((scope) =>
      SELF_SERVICE_SCOPE_SET.has(scope),
    ),
  );
}

/**
 * The level per resource that covers a flat scope list, for showing a preset
 * in the editor: a resource is `write` when the list holds any of its write
 * scopes, `read` when it holds its read scopes, otherwise `none`. Applying the
 * result can grant more than the list (Write includes every write scope).
 */
export function resolveApiKeyPermissionLevels(
  scopes: readonly string[],
): Record<string, ApiKeyPermissionLevel> {
  const held = new Set(scopes);
  const levels: Record<string, ApiKeyPermissionLevel> = {};
  for (const group of API_KEY_PERMISSION_GROUPS) {
    for (const resource of group.resources) {
      const hasWrite =
        resource.levels.includes('write') &&
        resource.writeScopes.some((scope) => held.has(scope));
      const hasRead =
        resource.levels.includes('read') &&
        resource.readScopes.length > 0 &&
        resource.readScopes.every((scope) => held.has(scope));
      levels[resource.id] = hasWrite ? 'write' : hasRead ? 'read' : 'none';
    }
  }
  return levels;
}

/**
 * The scopes a level per resource id grants. Unknown ids, and levels a
 * resource does not offer, grant nothing.
 */
export function resolveApiKeyPermissionScopes(
  levels: ApiKeyPermissionLevels,
): string[] {
  const scopes = new Set<string>();
  for (const group of API_KEY_PERMISSION_GROUPS) {
    for (const resource of group.resources) {
      const level = levels[resource.id];
      if (!level || !resource.levels.includes(level)) continue;
      for (const scope of scopesForLevel(resource, level)) scopes.add(scope);
    }
  }
  return [...scopes];
}

/** Whether a resource id names a registry resource that offers `level`. */
export function isApiKeyPermissionLevelOffered(
  resourceId: string,
  level: ApiKeyPermissionLevel,
): boolean {
  return API_KEY_PERMISSION_GROUPS.some((group) =>
    group.resources.some(
      (resource) =>
        resource.id === resourceId && resource.levels.includes(level),
    ),
  );
}
