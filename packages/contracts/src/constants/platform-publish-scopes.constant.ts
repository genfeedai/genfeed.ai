import { CredentialPlatform } from '..';

/**
 * Scopes each publishing platform must have granted before Genfeed can post.
 *
 * These are the provider-side publish permissions already requested at connect.
 * This map does not change consent screens or request additional scopes.
 */
export const PLATFORM_REQUIRED_PUBLISH_SCOPES = {
  [CredentialPlatform.FACEBOOK]: ['pages_manage_posts'],
  [CredentialPlatform.FANVUE]: ['write:media', 'write:post'],
  [CredentialPlatform.INSTAGRAM]: ['instagram_content_publish'],
  [CredentialPlatform.LINKEDIN]: ['w_member_social'],
  [CredentialPlatform.TIKTOK]: ['video.publish'],
  [CredentialPlatform.TWITTER]: ['tweet.write'],
  [CredentialPlatform.YOUTUBE]: [
    'https://www.googleapis.com/auth/youtube.upload',
  ],
} as const satisfies Partial<Record<CredentialPlatform, readonly string[]>>;

export type PublishPlatformWithRequiredScopes =
  keyof typeof PLATFORM_REQUIRED_PUBLISH_SCOPES;

export function getRequiredPublishScopes(
  platform: string,
): readonly string[] | undefined {
  if (!(platform in PLATFORM_REQUIRED_PUBLISH_SCOPES)) {
    return undefined;
  }

  return PLATFORM_REQUIRED_PUBLISH_SCOPES[
    platform as PublishPlatformWithRequiredScopes
  ];
}
