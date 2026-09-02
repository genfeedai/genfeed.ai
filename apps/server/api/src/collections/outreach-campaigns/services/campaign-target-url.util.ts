import { CampaignPlatform, CampaignTargetType } from '@genfeedai/contracts';

export interface ParsedCampaignTargetUrl {
  externalId: string;
  platform: CampaignPlatform;
  targetType: CampaignTargetType;
}

const TWITTER_HOSTNAMES = new Set([
  'twitter.com',
  'www.twitter.com',
  'www.x.com',
  'x.com',
]);

const REDDIT_HOSTNAMES = new Set([
  'old.reddit.com',
  'reddit.com',
  'www.reddit.com',
]);

const TWITTER_STATUS_PATTERN = /\/(?:[\w]+)\/status\/(\d+)/;
const REDDIT_POST_PATTERN = /\/r\/[\w]+\/comments\/([\w]+)/;
const REDDIT_COMMENT_PATTERN = /\/r\/[\w]+\/comments\/[\w]+\/[\w]+\/([\w]+)/;

/**
 * Parse a target URL into the platform, target type and external id the
 * campaign-target rows are keyed by. Returns `null` for anything unparseable
 * so callers can count it as skipped rather than failing the whole batch.
 */
export function parseCampaignTargetUrl(
  url: string,
): ParsedCampaignTargetUrl | null {
  let urlObj: URL;

  try {
    urlObj = new URL(url);
  } catch {
    return null;
  }

  if (TWITTER_HOSTNAMES.has(urlObj.hostname)) {
    const match = urlObj.pathname.match(TWITTER_STATUS_PATTERN);

    if (match?.[1]) {
      return {
        externalId: match[1],
        platform: CampaignPlatform.TWITTER,
        targetType: CampaignTargetType.TWEET,
      };
    }
  }

  if (REDDIT_HOSTNAMES.has(urlObj.hostname)) {
    const postMatch = urlObj.pathname.match(REDDIT_POST_PATTERN);

    if (postMatch?.[1]) {
      // A comment permalink is the post path plus the comment id, so the
      // comment pattern has to win when both match.
      const commentMatch = urlObj.pathname.match(REDDIT_COMMENT_PATTERN);

      if (commentMatch?.[1]) {
        return {
          externalId: commentMatch[1],
          platform: CampaignPlatform.REDDIT,
          targetType: CampaignTargetType.REDDIT_COMMENT,
        };
      }

      return {
        externalId: postMatch[1],
        platform: CampaignPlatform.REDDIT,
        targetType: CampaignTargetType.REDDIT_POST,
      };
    }
  }

  return null;
}
