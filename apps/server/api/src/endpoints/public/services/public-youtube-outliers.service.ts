import { parseYoutubeChannelInput } from '@api/endpoints/public/utils/youtube-channel-input.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { YoutubePublicProvider } from '@api/services/source-collector/providers/youtube-public.provider';
import type { CollectedSourcePost } from '@api/services/source-collector/source-collector.types';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import type {
  IPublicYoutubeOutliersToolResult,
  IPublicYoutubeOutlierVideo,
} from '@genfeedai/contracts/interfaces';
import { computeOutlierBaseline } from '@genfeedai/helpers';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

/** Newest uploads read per lookup: about five YouTube API quota units. */
const VIDEOS_READ = 100;
const OUTLIERS_RETURNED = 10;
const OUTLIER_THRESHOLD = 3;
const BREAKOUT_THRESHOLD = 10;
const PUBLIC_ORGANIZATION = 'public-tool';

/**
 * Ranks a channel's uploads by views against the channel's own typical video,
 * with the same baseline Analytics > Outliers uses: the median views of the
 * latest 20 matured uploads, 3x for an outlier and 10x for a breakout.
 */
export function buildYoutubeOutliers(
  channelId: string,
  posts: readonly CollectedSourcePost[],
  nowMs: number,
): IPublicYoutubeOutliersToolResult {
  const scope = {
    accountId: channelId,
    contentType: 'video',
    organizationId: PUBLIC_ORGANIZATION,
    platform: 'youtube',
  };
  const baseline = computeOutlierBaseline({
    nowMs,
    options: {
      breakoutThreshold: BREAKOUT_THRESHOLD,
      outlierThreshold: OUTLIER_THRESHOLD,
    },
    posts: posts.map((post) => ({
      ...scope,
      id: post.id,
      isDeleted: false,
      isPinned: null,
      isPromoted: null,
      publishedAtMs: post.createdAt?.getTime() ?? Number.NaN,
      views: post.metrics?.views ?? null,
    })),
    scope,
  });
  const byId = new Map(posts.map((post) => [post.id, post]));
  const outliers: IPublicYoutubeOutlierVideo[] = [];
  for (const result of baseline.posts) {
    const post = byId.get(result.id);
    if (!post || result.ratio === null || !post.createdAt) continue;
    outliers.push({
      publishedAt: post.createdAt.toISOString(),
      ratio: Math.round(result.ratio * 10) / 10,
      thumbnailUrl: post.thumbnailUrl,
      tier: result.tier,
      title: (post.text ?? '').split('\n')[0] || post.id,
      url: post.contentUrl ?? `https://www.youtube.com/watch?v=${post.id}`,
      videoId: post.id,
      views: post.metrics?.views ?? 0,
    });
  }
  outliers.sort((a, b) => b.ratio - a.ratio || b.views - a.views);
  return {
    baselineSampleSize: baseline.sampleSize,
    baselineViews: baseline.median,
    breakoutThreshold: BREAKOUT_THRESHOLD,
    channelId,
    channelTitle: posts[0]?.authorDisplayName,
    id: channelId,
    outlierThreshold: OUTLIER_THRESHOLD,
    outliers: outliers.slice(0, OUTLIERS_RETURNED),
    status: baseline.status,
    videosAnalyzed: posts.length,
  };
}

@Traced()
@Injectable()
export class PublicYoutubeOutliersService {
  constructor(private readonly youtube: YoutubePublicProvider) {}

  async find(channelInput: string): Promise<IPublicYoutubeOutliersToolResult> {
    const channel = parseYoutubeChannelInput(channelInput);
    if (!channel) {
      throw new BadRequestException(
        'Use a YouTube channel URL such as youtube.com/@name, an @handle or a channel ID.',
      );
    }
    const platform = SocialSourcePlatform.YOUTUBE;
    if (!(await this.youtube.canCollect(platform, {}))) {
      throw new ServiceUnavailableException(
        'The outlier finder is unavailable. Try again later.',
      );
    }
    let posts: CollectedSourcePost[];
    try {
      ({ posts } = await this.youtube.collectTimeline(platform, channel, {
        limit: VIDEOS_READ,
      }));
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'YouTube public API channel-not-found'
      ) {
        throw new NotFoundException({
          message: 'No YouTube channel matches that input.',
        });
      }
      throw new ServiceUnavailableException(
        'YouTube did not answer. Try again in a few minutes.',
      );
    }
    const channelId = posts[0]?.authorId ?? channel;
    return buildYoutubeOutliers(channelId, posts, Date.now());
  }
}
