/**
 * How a channel counts the length of a caption.
 *
 * Shared by caption validation, the platform preview, generation and the
 * publishers, so they all agree on what fits. It lives with the contracts
 * because the caption rules read it and the contracts cannot import helpers.
 */
import * as twitterTextModule from 'twitter-text';
import { CredentialPlatform, parsePlatform } from '../..';

/**
 * `twitter-text` ships its browser build as a lone default export and its Node
 * build as CommonJS, so a named import fails in bundlers. Reading the default
 * when there is one works under both.
 */
const twitterText =
  (twitterTextModule as { default?: typeof twitterTextModule }).default ??
  twitterTextModule;

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

/**
 * Whether a channel counts text with X's weighted rules: every URL is 23,
 * and emoji and CJK characters count 2.
 */
export function isWeightedPlatformLength(platform: string): boolean {
  return parsePlatform(platform) === CredentialPlatform.TWITTER;
}

/**
 * Whether a channel counts user-perceived characters (graphemes) instead of
 * code points. Bluesky limits a post to 300 graphemes, so a family emoji or a
 * flag counts once there.
 */
function isGraphemePlatformLength(platform: string): boolean {
  return parsePlatform(platform) === CredentialPlatform.BLUESKY;
}

/**
 * Text length as the channel counts it: `twitter-text` weighted length for X,
 * graphemes for Bluesky, code points everywhere else.
 */
export function measurePlatformText(text: string, platform: string): number {
  if (isWeightedPlatformLength(platform)) {
    return twitterText.parseTweet(text).weightedLength;
  }
  if (isGraphemePlatformLength(platform)) {
    let count = 0;
    for (const _segment of graphemeSegmenter.segment(text)) {
      count += 1;
    }
    return count;
  }
  return Array.from(text).length;
}
