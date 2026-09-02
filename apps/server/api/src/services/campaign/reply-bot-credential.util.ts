import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';
import type { IReplyBotCredentialData } from '@genfeedai/contracts/interfaces';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';

type ReplyBotCredentialPlatform = IReplyBotCredentialData['platform'];

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const decryptOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0
    ? EncryptionUtil.decrypt(value)
    : undefined;

const readOptionalPlatform = (
  value: unknown,
  platformOverride?: ReplyBotCredentialPlatform,
): ReplyBotCredentialPlatform | undefined => {
  if (platformOverride) {
    return platformOverride;
  }
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    // Prisma SCREAMING → domain lowercase when possible.
    const fromPrisma = fromPrismaCredentialPlatform(value);
    if (fromPrisma) {
      return fromPrisma as unknown as ReplyBotCredentialPlatform;
    }
    return value.trim().toLowerCase() as unknown as ReplyBotCredentialPlatform;
  }

  return String(value) as unknown as ReplyBotCredentialPlatform;
};

export interface ToReplyBotCredentialOptions {
  brandId?: string;
  organizationId?: string;
  platform?: ReplyBotCredentialPlatform;
}

/**
 * Decrypt credential secrets once at the load boundary for reply-bot posting.
 * Prefer this over copy-pasted EncryptionUtil.decrypt blocks.
 */
export function toReplyBotCredentialData(
  credential: Record<string, unknown>,
  options: ToReplyBotCredentialOptions = {},
): IReplyBotCredentialData | null {
  if (typeof credential.accessToken !== 'string') {
    return null;
  }

  const username =
    readOptionalString(credential.username) ??
    readOptionalString(credential.externalHandle) ??
    readOptionalString(credential.externalId);

  return {
    accessToken: EncryptionUtil.decrypt(credential.accessToken),
    accessTokenSecret: decryptOptionalString(credential.accessTokenSecret),
    brandId: options.brandId ?? readOptionalString(credential.brandId),
    externalId: readOptionalString(credential.externalId),
    id: readOptionalString(credential.id),
    organizationId:
      options.organizationId ?? readOptionalString(credential.organizationId),
    platform: readOptionalPlatform(credential.platform, options.platform),
    refreshToken: decryptOptionalString(credential.refreshToken),
    username,
  };
}

/**
 * Prefer root credentialId, then nested config.credentialId (legacy bag).
 * Shared by queue fan-out, worker cron, and author-reply config reads.
 */
export function readReplyBotCredentialId(
  config: Record<string, unknown> | { credentialId?: string; config?: unknown },
): string | undefined {
  const root = (config as { credentialId?: unknown }).credentialId;
  if (typeof root === 'string' && root.trim()) {
    return root.trim();
  }

  const nestedConfig = (config as { config?: unknown }).config;
  const payload =
    nestedConfig &&
    typeof nestedConfig === 'object' &&
    !Array.isArray(nestedConfig)
      ? (nestedConfig as Record<string, unknown>)
      : {};

  const nested = payload.credentialId;
  return typeof nested === 'string' && nested.trim()
    ? nested.trim()
    : undefined;
}
