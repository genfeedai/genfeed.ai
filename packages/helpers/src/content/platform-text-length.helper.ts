import { CredentialPlatform } from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { parseTweet } from 'twitter-text';

/**
 * Whether a channel counts text with X's weighted rules: every URL is 23,
 * and emoji and CJK characters count 2.
 */
export function isWeightedPlatformLength(platform: string): boolean {
  return (
    getChannelCapability(platform)?.platform === CredentialPlatform.TWITTER
  );
}

/**
 * Text length as the channel counts it: `twitter-text` weighted length for X,
 * code points everywhere else. Generation, the autopilot gate, fan-out and the
 * publisher all measure with this so they agree on what fits.
 */
export function measurePlatformText(text: string, platform: string): number {
  return isWeightedPlatformLength(platform)
    ? parseTweet(text).weightedLength
    : Array.from(text).length;
}

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
