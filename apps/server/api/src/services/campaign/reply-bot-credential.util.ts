import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import type { IReplyBotCredentialData } from '@genfeedai/interfaces';

type ReplyBotCredentialPlatform = IReplyBotCredentialData['platform'];

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const decryptOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? EncryptionUtil.decrypt(value) : undefined;

const readOptionalPlatform = (
  value: unknown,
): ReplyBotCredentialPlatform | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  // Campaign credential rows already store enum-compatible platform strings;
  // keep the legacy string coercion at this credential boundary.
  return String(value) as ReplyBotCredentialPlatform;
};

export function toReplyBotCredentialData(
  credential: Record<string, unknown>,
): IReplyBotCredentialData | null {
  if (typeof credential.accessToken !== 'string') {
    return null;
  }

  return {
    accessToken: EncryptionUtil.decrypt(credential.accessToken),
    accessTokenSecret: decryptOptionalString(credential.accessTokenSecret),
    externalId: readOptionalString(credential.externalId),
    platform: readOptionalPlatform(credential.platform),
    refreshToken: decryptOptionalString(credential.refreshToken),
    username: readOptionalString(credential.username),
  };
}
