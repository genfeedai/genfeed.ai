/**
 * Public creator URLs on genfeed.ai. A creator is a public brand, addressed by
 * its handle (`Brand.slug`): `genfeed.ai/@<handle>` is the profile and every
 * piece of public content hangs under it.
 */
export const GENFEED_BRAND_HANDLE = 'genfeedai';

export const CREATOR_PROFILE_TABS = [
  'articles',
  'posts',
  'videos',
  'images',
] as const;

export type CreatorProfileTab = (typeof CREATOR_PROFILE_TABS)[number];

export function creatorProfilePath(handle: string): string {
  return `/@${handle}`;
}

export function creatorTabPath(handle: string, tab: CreatorProfileTab): string {
  return `${creatorProfilePath(handle)}/${tab}`;
}

export function creatorArticlePath(handle: string, slug: string): string {
  return `${creatorTabPath(handle, 'articles')}/${slug}`;
}

export function creatorArticlePreviewPath(
  handle: string,
  slug: string,
): string {
  return `${creatorArticlePath(handle, slug)}/preview`;
}

export function creatorPostPath(handle: string, postId: string): string {
  return `${creatorTabPath(handle, 'posts')}/${encodeURIComponent(postId)}`;
}

export function creatorInvitePath(handle: string, token: string): string {
  return `${creatorProfilePath(handle)}/invite/${encodeURIComponent(token)}`;
}

/**
 * The handle an article is published under. Only Genfeed's own organization
 * publishes articles without a brand, and those belong to `@genfeedai`.
 */
export function articleHandle(brandSlug: string | null | undefined): string {
  return brandSlug || GENFEED_BRAND_HANDLE;
}
