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
  { label: 'Posts', scopes: ['posts:read'] },
  { label: 'Connected accounts', scopes: ['credentials:read'] },
  { label: 'Post drafts', scopes: ['posts:draft'] },
  { label: 'Post scheduling', scopes: ['posts:schedule'] },
  { label: 'Publish approvals', scopes: ['posts:approve'] },
  { label: 'Direct publishing', scopes: ['posts:publish'] },
  { label: 'Brands', scopes: ['brands:read'] },
  { label: 'Credits', scopes: ['credits:read'] },
  { label: 'Analytics', scopes: ['analytics:read'] },
] as const;
