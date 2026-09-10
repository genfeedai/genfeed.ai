import type {
  ICredential,
  IPostPlatformConfig,
} from '@genfeedai/contracts/interfaces';
import type { PostCharacterUsageItem } from '@genfeedai/props/posts/post-character-usage.props';
import {
  resolvePlatformCharLimit,
  resolvePlatformLabel,
} from '@ui-constants/platform-char-limit.constant';

/**
 * Characters a caption uses on a provider, counted the way the capability
 * catalog counts them: code points, not UTF-16 units, so an emoji costs one.
 */
export function countCaptionCharacters(caption: string | undefined): number {
  return caption ? Array.from(caption).length : 0;
}

/**
 * One usage row per enabled channel, using the caption that channel will
 * actually publish — its own override when set, the shared caption otherwise.
 */
export function buildPostCharacterUsageItems(
  platformConfigs: IPostPlatformConfig[],
  globalDescription: string | undefined,
  credentials: ICredential[] = [],
): PostCharacterUsageItem[] {
  return platformConfigs
    .filter((config) => config.enabled && config.credentialId.trim().length > 0)
    .map((config) => {
      const credential = credentials.find(
        (candidate) => candidate.id === config.credentialId,
      );
      const accountLabel =
        config.handle?.trim() ||
        credential?.externalName?.trim() ||
        credential?.label?.trim() ||
        credential?.externalHandle?.trim() ||
        'Account';

      return {
        accountLabel,
        id: config.credentialId,
        limit: resolvePlatformCharLimit(config.platform),
        platformLabel: resolvePlatformLabel(config.platform),
        used: countCaptionCharacters(config.description || globalDescription),
      };
    });
}
