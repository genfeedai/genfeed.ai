import { CredentialPlatform } from '..';

/**
 * Platforms where Genfeed can delete a published post on the network itself.
 * Each one has a provider delete call Genfeed wires up and its connect scopes
 * already cover (X `tweet.write`, Mastodon `write:statuses`). On every other
 * platform the post is deleted in Genfeed only and the network copy stays.
 */
export const PLATFORMS_WITH_POST_DELETION: readonly CredentialPlatform[] = [
  CredentialPlatform.MASTODON,
  CredentialPlatform.TWITTER,
];

export function supportsPostDeletionOnPlatform(
  platform: string | null | undefined,
): boolean {
  return (
    typeof platform === 'string' &&
    (PLATFORMS_WITH_POST_DELETION as readonly string[]).includes(
      platform.toLowerCase(),
    )
  );
}
