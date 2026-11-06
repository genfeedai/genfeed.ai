/**
 * API key provider category. Values match Prisma `ApiKeyCategory`.
 * @see packages/prisma/prisma/schema.prisma `enum ApiKeyCategory`
 */
export enum ApiKeyCategory {
  GENFEEDAI = 'GENFEEDAI',
  ELEVENLABS = 'ELEVENLABS',
  HEDRA = 'HEDRA',
  HEYGEN = 'HEYGEN',
  OPUS_PRO = 'OPUS_PRO',
}

export enum ApiKeyScope {
  VIDEOS_READ = 'videos:read',
  VIDEOS_CREATE = 'videos:create',
  VIDEOS_UPDATE = 'videos:update',
  VIDEOS_DELETE = 'videos:delete',
  IMAGES_READ = 'images:read',
  IMAGES_CREATE = 'images:create',
  IMAGES_UPDATE = 'images:update',
  IMAGES_DELETE = 'images:delete',
  PROMPTS_READ = 'prompts:read',
  PROMPTS_CREATE = 'prompts:create',
  PROMPTS_UPDATE = 'prompts:update',
  PROMPTS_DELETE = 'prompts:delete',
  ARTICLES_READ = 'articles:read',
  ARTICLES_CREATE = 'articles:create',
  BRANDS_READ = 'brands:read',
  /** Create and edit brands and their context. Admin-minted keys only. */
  BRANDS_WRITE = 'brands:write',
  CREDITS_READ = 'credits:read',
  CREDITS_PROVISION = 'credits:provision',
  MANAGED_INFERENCE_EXECUTE = 'managed-inference:execute',
  /** Read posts, their schedule and their outcome. */
  POSTS_READ = 'posts:read',
  /** Read connected social accounts and their health. */
  CREDENTIALS_READ = 'credentials:read',
  POSTS_DRAFT = 'posts:draft',
  POSTS_SCHEDULE = 'posts:schedule',
  POSTS_APPROVE = 'posts:approve',
  POSTS_PUBLISH = 'posts:publish',
  ANALYTICS_READ = 'analytics:read',
  ADMIN = 'admin',
}

/** True only when the key was explicitly granted the privileged `admin` scope. */
export function hasExplicitApiKeyAdminScope(
  scopes: readonly string[] | undefined,
): boolean {
  return Array.isArray(scopes) && scopes.includes(ApiKeyScope.ADMIN);
}
