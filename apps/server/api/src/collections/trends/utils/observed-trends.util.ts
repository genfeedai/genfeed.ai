import type { TrendingHashtagDocument } from '@api/collections/trends/schemas/trending-hashtag.schema';
import type { TrendingSoundDocument } from '@api/collections/trends/schemas/trending-sound.schema';
import type { TrendingVideoDocument } from '@api/collections/trends/schemas/trending-video.schema';
import type {
  ITrendHashtag,
  ITrendSound,
  TrendMediaExample,
} from '@genfeedai/contracts/interfaces';

/** Observed counts within the eligible corpus, never platform-wide estimates. */
export function observedHashtags(
  videos: TrendingVideoDocument[],
  limit: number,
): (ITrendHashtag & TrendingHashtagDocument)[] {
  const tags = new Map<string, ITrendHashtag & TrendingHashtagDocument>();
  for (const video of videos) {
    if (!video.platform) continue;
    const uniqueTags = new Set(
      (video.hashtags ?? [])
        .map((tag) => tag.replace(/^#/, '').trim().toLowerCase())
        .filter(Boolean),
    );
    for (const hashtag of uniqueTags) {
      const key = `${video.platform}:${hashtag}`;
      const tag = tags.get(key) ?? {
        id: key,
        hashtag,
        platform: video.platform,
        postCount: 0,
        postCountScope: 'observed',
        viewCount: 0,
        viewsMeasured: true,
        growthRate: 0,
        growthMeasured: false,
        viralityScore: 0,
        scoreMeasured: false,
        relatedHashtags: [],
      };
      tag.postCount += 1;
      const hasViews =
        typeof video.viewCount === 'number' && Number.isFinite(video.viewCount);
      tag.viewsMeasured = tag.viewsMeasured && hasViews;
      tag.viewCount += hasViews ? (video.viewCount ?? 0) : 0;
      tags.set(key, tag);
    }
  }
  return [...tags.values()]
    .sort((a, b) => b.postCount - a.postCount || b.viewCount - a.viewCount)
    .slice(0, limit);
}

export function observedSounds(
  videos: TrendingVideoDocument[],
  limit: number,
): (ITrendSound & TrendingSoundDocument)[] {
  const sounds = new Map<string, ITrendSound & TrendingSoundDocument>();
  for (const video of videos) {
    if (!video.soundId || video.platform !== 'tiktok') continue;
    const key = `${video.platform}:${video.soundId}`;
    const sound = sounds.get(key) ?? {
      id: key,
      soundId: video.soundId,
      soundName: video.soundName || 'Unknown',
      platform: video.platform,
      authorName:
        typeof video.soundAuthorName === 'string'
          ? video.soundAuthorName
          : undefined,
      coverUrl:
        typeof video.soundCoverUrl === 'string'
          ? video.soundCoverUrl
          : undefined,
      playUrl:
        typeof video.soundPlayUrl === 'string' ? video.soundPlayUrl : undefined,
      duration:
        typeof video.soundDuration === 'number'
          ? video.soundDuration
          : undefined,
      usageCount: 0,
      usageCountScope: 'observed',
      growthRate: 0,
      viralityScore: 0,
      scoreMeasured: false,
      examples: [],
    };
    sound.usageCount += 1;
    if (video.externalId && (sound.examples?.length ?? 0) < 3) {
      const example: TrendMediaExample = {
        externalId: video.externalId,
        platform: video.platform,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        videoUrl: video.videoUrl,
        creatorHandle: video.creatorHandle ?? '',
      };
      sound.examples?.push(example);
    }
    sounds.set(key, sound);
  }
  return [...sounds.values()]
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit);
}
