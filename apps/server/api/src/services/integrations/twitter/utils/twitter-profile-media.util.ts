/**
 * `user.fields` for a profile whose avatar and header Genfeed reuses. A
 * comma-separated string because twitter-api-v2's field union predates
 * `profile_banner_url`.
 */
export const TWITTER_PROFILE_MEDIA_USER_FIELDS =
  'profile_image_url,profile_banner_url';

const TWITTER_BANNER_SIZE_SUFFIX = /\/\d+x\d+$/;

/**
 * X returns a 48px `_normal` avatar. The same path serves `_400x400`, the
 * largest square rendition, which is what a brand logo needs.
 */
export function toTwitterFullSizeAvatarUrl(
  profileImageUrl: string | null | undefined,
): string | undefined {
  if (!profileImageUrl) {
    return undefined;
  }

  return profileImageUrl.replace(/_normal(\.[a-z]+)$/i, '_400x400$1');
}

/**
 * X returns the banner as a size-less directory URL; `/1500x500` is its
 * full-width web rendition. Reads the field defensively because
 * twitter-api-v2's `UserV2` type does not declare it.
 */
export function readTwitterBannerUrl(user: object): string | undefined {
  const profileBannerUrl =
    'profile_banner_url' in user ? user.profile_banner_url : undefined;

  if (typeof profileBannerUrl !== 'string' || !profileBannerUrl.trim()) {
    return undefined;
  }

  const bannerUrl = profileBannerUrl.trim().replace(/\/+$/, '');

  return TWITTER_BANNER_SIZE_SUFFIX.test(bannerUrl)
    ? bannerUrl
    : `${bannerUrl}/1500x500`;
}
