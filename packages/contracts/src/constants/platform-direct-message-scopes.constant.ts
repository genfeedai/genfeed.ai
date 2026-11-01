import { CredentialPlatform } from '..';

/**
 * Scopes a platform must have granted before Genfeed can read the account's
 * direct messages into Messages.
 *
 * Kept apart from `PLATFORM_REQUIRED_PUBLISH_SCOPES`: a missing DM scope never
 * blocks publishing, and X's publish permission is only `tweet.write`.
 */
export const PLATFORM_REQUIRED_DIRECT_MESSAGE_SCOPES = {
  [CredentialPlatform.TWITTER]: ['dm.read'],
} as const satisfies Partial<Record<CredentialPlatform, readonly string[]>>;

export type DirectMessagePlatformWithRequiredScopes =
  keyof typeof PLATFORM_REQUIRED_DIRECT_MESSAGE_SCOPES;

export function getRequiredDirectMessageScopes(
  platform: string,
): readonly string[] | undefined {
  if (!(platform in PLATFORM_REQUIRED_DIRECT_MESSAGE_SCOPES)) {
    return undefined;
  }

  return PLATFORM_REQUIRED_DIRECT_MESSAGE_SCOPES[
    platform as DirectMessagePlatformWithRequiredScopes
  ];
}
