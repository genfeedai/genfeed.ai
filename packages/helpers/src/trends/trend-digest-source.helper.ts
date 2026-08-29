/**
 * Maps stored trend documents onto the digest item shape.
 *
 * This lived twice — once in the workers-facing trend summary service and once
 * in the workflow `trendDigest` node registrar — and the two copies drifted
 * onto field names the ingest never writes (`views` / `playCount` instead of
 * `viewCount`, `url` instead of `videoUrl`). The digest rendered rows with no
 * title, no count and no link as a result, so the mapping lives here once.
 *
 * Pure functions only: no I/O, no `process.env`, no service access.
 */
import type { TrendDigestItem } from './trend-digest.helper';

/** Structural view of a stored `trendingVideo.data` blob. */
export interface RawTrendVideo {
  platform?: string;
  title?: string;
  description?: string;
  videoUrl?: string;
  playUrl?: string;
  viewCount?: number;
  viralScore?: number;
}

/** Structural view of a stored `trendingHashtag.data` blob. */
export interface RawTrendHashtag {
  platform?: string;
  hashtag?: string;
  postCount?: number;
  viewCount?: number;
  viralityScore?: number;
}

/** Structural view of a stored `trendingSound.data` blob. */
export interface RawTrendSound {
  platform?: string;
  soundName?: string;
  playUrl?: string;
  usageCount?: number;
  viralityScore?: number;
}

export interface TrendDigestSources {
  videos: RawTrendVideo[];
  hashtags: RawTrendHashtag[];
  sounds: RawTrendSound[];
}

export interface TrendDigestSourceOptions {
  /** Minimum score an entry must carry to reach the digest. */
  minViralScore: number;
  /** Keep only these platforms. Empty or omitted keeps every platform. */
  platforms?: string[];
  /** Cap the ranked result. Omitted keeps everything above the threshold. */
  limit?: number;
}

const DEFAULT_VIDEO_PLATFORM = 'tiktok';
const SOUND_PLATFORM = 'tiktok';

/** A trend with no name is a blank row — the digest is better off without it. */
function firstNonEmpty(
  ...values: Array<string | undefined>
): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

function mapVideos(videos: RawTrendVideo[]): TrendDigestItem[] {
  const items: TrendDigestItem[] = [];

  for (const video of videos) {
    const topic = firstNonEmpty(video.title, video.description);
    if (!topic) {
      continue;
    }

    items.push({
      platform: video.platform || DEFAULT_VIDEO_PLATFORM,
      topic,
      type: 'video',
      url: firstNonEmpty(video.videoUrl, video.playUrl),
      usageCount: video.viewCount,
      viralScore: video.viralScore ?? 0,
    });
  }

  return items;
}

function mapHashtags(hashtags: RawTrendHashtag[]): TrendDigestItem[] {
  const items: TrendDigestItem[] = [];

  for (const hashtag of hashtags) {
    const tag = firstNonEmpty(hashtag.hashtag);
    if (!tag) {
      continue;
    }

    items.push({
      platform: hashtag.platform || DEFAULT_VIDEO_PLATFORM,
      topic: tag.startsWith('#') ? tag : `#${tag}`,
      type: 'hashtag',
      usageCount: hashtag.postCount ?? hashtag.viewCount,
      viralScore: hashtag.viralityScore ?? 0,
    });
  }

  return items;
}

function mapSounds(sounds: RawTrendSound[]): TrendDigestItem[] {
  const items: TrendDigestItem[] = [];

  for (const sound of sounds) {
    const topic = firstNonEmpty(sound.soundName);
    if (!topic) {
      continue;
    }

    items.push({
      platform: sound.platform || SOUND_PLATFORM,
      topic,
      type: 'sound',
      url: firstNonEmpty(sound.playUrl),
      usageCount: sound.usageCount,
      viralScore: sound.viralityScore ?? 0,
    });
  }

  return items;
}

/**
 * Build the ranked digest items for a set of stored trend documents.
 *
 * One score gate applies to every type. Sounds used to be gated on a raw
 * `usageCount >= 10000`, which the ingest can never satisfy — it counts how
 * many videos in a single scraped batch share a sound, so the value tops out
 * in the dozens and the "Trending Sounds" section could never render.
 */
export function buildTrendDigestItems(
  sources: TrendDigestSources,
  options: TrendDigestSourceOptions,
): TrendDigestItem[] {
  const allowed = new Set(
    (options.platforms ?? []).map((platform) => platform.toLowerCase()),
  );

  const ranked = [
    ...mapVideos(sources.videos),
    ...mapHashtags(sources.hashtags),
    ...mapSounds(sources.sounds),
  ]
    .filter((item) => item.viralScore >= options.minViralScore)
    .filter(
      (item) => allowed.size === 0 || allowed.has(item.platform.toLowerCase()),
    )
    .sort((a, b) => b.viralScore - a.viralScore);

  return options.limit == null ? ranked : ranked.slice(0, options.limit);
}
