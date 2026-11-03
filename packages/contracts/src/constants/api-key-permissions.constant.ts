import type {
  ApiKeyPermissionLevel,
  IApiKeyPermissionGroup,
} from '../interfaces/core/api-key-permission.interface';

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
        isSelfService: true,
        label: 'Videos',
        levels: ['none', 'read', 'write'],
        readScopes: ['videos:read'],
        writeScopes: ['videos:create', 'videos:update', 'videos:delete'],
      },
      {
        id: 'images',
        isSelfService: true,
        label: 'Images',
        levels: ['none', 'read', 'write'],
        readScopes: ['images:read'],
        writeScopes: ['images:create', 'images:update', 'images:delete'],
      },
      {
        id: 'prompts',
        isSelfService: true,
        label: 'Prompts',
        levels: ['none', 'read', 'write'],
        readScopes: ['prompts:read'],
        writeScopes: ['prompts:create', 'prompts:update', 'prompts:delete'],
      },
      {
        id: 'articles',
        isSelfService: true,
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
        isSelfService: true,
        label: 'Post drafts',
        levels: ['none', 'write'],
        readScopes: [],
        writeScopes: ['posts:draft'],
      },
      {
        id: 'post-scheduling',
        isSelfService: true,
        label: 'Post scheduling',
        levels: ['none', 'write'],
        readScopes: [],
        writeScopes: ['posts:schedule'],
      },
      {
        id: 'publish-approvals',
        isSelfService: true,
        label: 'Publish approvals',
        levels: ['none', 'write'],
        readScopes: [],
        writeScopes: ['posts:approve'],
      },
      {
        id: 'direct-publishing',
        isSelfService: true,
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
        isSelfService: false,
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
        isSelfService: true,
        label: 'Analytics',
        levels: ['none', 'read'],
        readScopes: ['analytics:read'],
        writeScopes: [],
      },
      {
        id: 'credits',
        isSelfService: true,
        label: 'Credits',
        levels: ['none', 'read'],
        readScopes: ['credits:read'],
        writeScopes: [],
      },
    ],
  },
];

/**
 * The scopes a level per resource id grants. Unknown ids, and levels a
 * resource does not offer, grant nothing.
 */
export function resolveApiKeyPermissionScopes(
  levels: Readonly<Record<string, ApiKeyPermissionLevel | undefined>>,
): string[] {
  const scopes = new Set<string>();
  for (const group of API_KEY_PERMISSION_GROUPS) {
    for (const resource of group.resources) {
      const level = levels[resource.id];
      if (!level || !resource.levels.includes(level)) continue;
      if (level === 'read' || level === 'write') {
        for (const scope of resource.readScopes) scopes.add(scope);
      }
      if (level === 'write') {
        for (const scope of resource.writeScopes) scopes.add(scope);
      }
    }
  }
  return [...scopes];
}
