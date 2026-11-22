import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { isWeightedPlatformLength } from '@genfeedai/contracts/api-types/contracts/platform-text-length.contract';

/** The channel's caption limit, or undefined when the channel has none. */
export function getPlatformTextLimit(platform: string): number | undefined {
  return getChannelCapability(platform)?.caption.maxLength;
}

/**
 * The length rule to put in a generation or rewrite prompt, or undefined when
 * the channel has no known limit. `maxLength` defaults to the channel limit.
 */
export function describePlatformTextLimit(
  platform: string,
  maxLength = getPlatformTextLimit(platform),
): string | undefined {
  if (maxLength === undefined) return undefined;
  return isWeightedPlatformLength(platform)
    ? `${maxLength} characters max as X counts them (each link counts 23, each emoji or CJK character counts 2)`
    : `${maxLength} characters max`;
}
