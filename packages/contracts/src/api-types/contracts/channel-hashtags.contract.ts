/**
 * The hashtag limit of a channel, read from the channel capability catalog
 * ({@link ./channel-capabilities.contract}). Every prompt and rule that bounds
 * hashtags reads it here.
 */
import type { CredentialPlatform } from '../..';
import { getChannelCapability } from './channel-capabilities.contract';
import { describeHashtagRule } from './channel-caption.contract';

/**
 * The most hashtags a caption for the channel may carry, from the catalog.
 * Every prompt and rule that bounds hashtags reads it here.
 */
export function getChannelHashtagLimit(
  platform: CredentialPlatform | string,
): number | undefined {
  return getChannelCapability(platform)?.caption.maxHashtags;
}

/**
 * The hashtag rule a model prompt states for a channel, read from the catalog.
 * A channel with no declared limit gets the open-ended rule, never a number.
 */
export function describeChannelHashtagRule(
  platform: CredentialPlatform | string,
): string {
  const limit = getChannelHashtagLimit(platform);
  return limit === undefined
    ? 'use a few relevant hashtags'
    : describeHashtagRule(limit);
}
