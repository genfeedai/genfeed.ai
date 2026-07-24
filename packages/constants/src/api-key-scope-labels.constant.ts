export const API_KEY_SCOPE_OPTIONS = [
  {
    label: 'Videos',
    scopes: ['videos:read', 'videos:create'],
  },
  {
    label: 'Images',
    scopes: ['images:read', 'images:create'],
  },
  {
    label: 'Prompts',
    scopes: ['prompts:read', 'prompts:create'],
  },
  {
    label: 'Articles',
    scopes: ['articles:read', 'articles:create'],
  },
  { label: 'Posts', scopes: ['posts:create'] },
  { label: 'Brands', scopes: ['brands:read'] },
  { label: 'Credits', scopes: ['credits:read'] },
  { label: 'Analytics', scopes: ['analytics:read'] },
] as const;
