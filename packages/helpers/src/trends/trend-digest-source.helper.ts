/**
 * Maps stored trend documents onto the digest item shape.
 *
 * This lived twice — once in the workers-facing trend summary service and once
 * in the workflow `trendDigest` node registrar — and the two copies drifted
 * onto field names the ingest never writes (`views` / `playCount` instead of
 * `viewCount`, `url` instead of `videoUrl`). The topic corpus `get_trends`
 * reads is a fourth source: `topic`/`name` and `viralityScore`/`score`, not
 * the video title and `viralScore`. The digest rendered rows with no title,
 * no count and no link — or skipped as empty — when those names drifted, so
 * the mapping lives here once.
 *
 * Pure functions only: no I/O, no `process.env`, no service access.
 */
import type { TrendDigestItem } from './trend-digest.helper';

/** Structural view of a stored `trendingVideo.data` blob. */
export interface RawTrendVideo {
  platform?: string;
  title?: string;
  description?: string;
  topic?: string;
  videoUrl?: string;
  playUrl?: string;
  viewCount?: number;
  viralScore?: number;
  /** Some ingest paths write the calibrated score under this name. */
  viralityScore?: number;
  /** `get_trends` exposes the corpus score under this name. */
  score?: number;
}

/** Structural view of a stored `trendingHashtag.data` blob. */
export interface RawTrendHashtag {
  platform?: string;
  hashtag?: string;
  topic?: string;
  postCount?: number;
  viewCount?: number;
  viralityScore?: number;
  viralScore?: number;
  score?: number;
}

/** Structural view of a stored `trendingSound.data` blob. */
export interface RawTrendSound {
  platform?: string;
  soundName?: string;
  name?: string;
  topic?: string;
  playUrl?: string;
  usageCount?: number;
  viralityScore?: number;
  viralScore?: number;
  score?: number;
}

/**
 * Structural view of a cached topic-corpus row (`trends` table / `get_trends`).
 * The digest used to read only videos, hashtags, and sounds, so a corpus
 * `get_trends` could list never reached the email.
 */
export interface RawTrendTopic {
  platform?: string;
  topic?: string;
  name?: string;
  title?: string;
  url?: string;
  videoUrl?: string;
  mentions?: number;
  viralScore?: number;
  viralityScore?: number;
  score?: number;
  metadata?: RawTrendTopicMetadata;
  data?: RawTrendTopicData;
}

export interface RawTrendTopicMetadata {
  urls?: unknown;
  videoUrl?: unknown;
}

export interface RawTrendTopicData {
  mentions?: number;
  metadata?: RawTrendTopicMetadata;
  name?: string;
  platform?: string;
  score?: number;
  title?: string;
  topic?: string;
  viralScore?: number;
  viralityScore?: number;
}

export interface TrendDigestSources {
  videos: RawTrendVideo[];
  hashtags: RawTrendHashtag[];
  sounds: RawTrendSound[];
  /** Cached topic corpus. Omitted by callers that only have media tables. */
  topics?: readonly RawTrendTopic[];
}

export interface TrendDigestAssembly {
  items: TrendDigestItem[];
  /** Named source rows before the viral-score and platform gates. */
  sourceTopicCount: number;
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

/**
 * A trend the ingest never scored cannot be ranked or thresholded, and a
 * `?? 0` fallback would smuggle it into the digest as a literal "Score: 0"
 * row whenever the configured threshold is 0. Absent stays absent.
 */
function sourceScore(value: number | undefined | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** First finite score wins. `0` is a real score; only absent falls through. */
function firstScore(
  ...values: Array<number | undefined | null>
): number | null {
  for (const value of values) {
    const score = sourceScore(value);
    if (score !== null) {
      return score;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readScore(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function firstMetadataUrl(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  if (!metadata) {
    return undefined;
  }
  const direct = readText(metadata.videoUrl)?.trim();
  if (direct) {
    return direct;
  }
  if (!Array.isArray(metadata.urls)) {
    return undefined;
  }
  for (const url of metadata.urls) {
    const text = readText(url)?.trim();
    if (text) {
      return text;
    }
  }
  return undefined;
}

/**
 * The topic corpus stores `topic` / `viralityScore` on the row and sometimes
 * `name` / `score` inside `data`. `get_trends` reads `topic ?? name` and
 * `score`, so both locations have to resolve before the threshold runs.
 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function flattenTopic(topic: RawTrendTopic): RawTrendTopic {
  const data = asRecord(topic.data) ?? {};
  const metadata = asRecord(topic.metadata) ?? asRecord(data.metadata);

  return {
    mentions:
      sourceScore(topic.mentions) ?? readScore(data.mentions) ?? undefined,
    name: firstNonEmpty(topic.name, readText(data.name)),
    platform: firstNonEmpty(topic.platform, readText(data.platform)),
    score: firstScore(topic.score, readScore(data.score)) ?? undefined,
    title: firstNonEmpty(topic.title, readText(data.title)),
    topic: firstNonEmpty(topic.topic, readText(data.topic)),
    url: firstNonEmpty(topic.url, topic.videoUrl, firstMetadataUrl(metadata)),
    viralScore:
      firstScore(topic.viralScore, readScore(data.viralScore)) ?? undefined,
    viralityScore:
      firstScore(topic.viralityScore, readScore(data.viralityScore)) ??
      undefined,
  };
}

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
    const topic = firstNonEmpty(video.title, video.description, video.topic);
    const score = firstScore(
      video.viralScore,
      video.viralityScore,
      video.score,
    );
    if (!topic || score === null) {
      continue;
    }

    items.push({
      platform: video.platform || DEFAULT_VIDEO_PLATFORM,
      topic,
      type: 'video',
      url: firstNonEmpty(video.videoUrl, video.playUrl),
      usageCount: video.viewCount,
      viralScore: score,
    });
  }

  return items;
}

function mapHashtags(hashtags: RawTrendHashtag[]): TrendDigestItem[] {
  const items: TrendDigestItem[] = [];

  for (const hashtag of hashtags) {
    const tag = firstNonEmpty(hashtag.hashtag, hashtag.topic);
    const score = firstScore(
      hashtag.viralityScore,
      hashtag.viralScore,
      hashtag.score,
    );
    if (!tag || score === null) {
      continue;
    }

    items.push({
      platform: hashtag.platform || DEFAULT_VIDEO_PLATFORM,
      topic: tag.startsWith('#') ? tag : `#${tag}`,
      type: 'hashtag',
      usageCount: hashtag.postCount ?? hashtag.viewCount,
      viralScore: score,
    });
  }

  return items;
}

function mapSounds(sounds: RawTrendSound[]): TrendDigestItem[] {
  const items: TrendDigestItem[] = [];

  for (const sound of sounds) {
    const topic = firstNonEmpty(sound.soundName, sound.name, sound.topic);
    const score = firstScore(
      sound.viralityScore,
      sound.viralScore,
      sound.score,
    );
    if (!topic || score === null) {
      continue;
    }

    items.push({
      platform: sound.platform || SOUND_PLATFORM,
      topic,
      type: 'sound',
      url: firstNonEmpty(sound.playUrl),
      usageCount: sound.usageCount,
      viralScore: score,
    });
  }

  return items;
}

function mapTopics(topics: readonly RawTrendTopic[]): TrendDigestItem[] {
  const items: TrendDigestItem[] = [];

  for (const raw of topics) {
    const topic = flattenTopic(raw);
    const label = firstNonEmpty(topic.topic, topic.name, topic.title);
    const score = firstScore(
      topic.viralityScore,
      topic.viralScore,
      topic.score,
    );
    if (!label || score === null) {
      continue;
    }

    items.push({
      platform: topic.platform || 'unspecified',
      topic: label,
      type: 'topic',
      ...(topic.url ? { url: topic.url } : {}),
      ...(typeof topic.mentions === 'number'
        ? { usageCount: topic.mentions }
        : {}),
      viralScore: score,
    });
  }

  return items;
}

function countSourceTopics(sources: TrendDigestSources): number {
  let count = 0;

  for (const video of sources.videos) {
    if (firstNonEmpty(video.title, video.description, video.topic)) {
      count += 1;
    }
  }
  for (const hashtag of sources.hashtags) {
    if (firstNonEmpty(hashtag.hashtag, hashtag.topic)) {
      count += 1;
    }
  }
  for (const sound of sources.sounds) {
    if (firstNonEmpty(sound.soundName, sound.name, sound.topic)) {
      count += 1;
    }
  }
  for (const topic of sources.topics ?? []) {
    const flat = flattenTopic(topic);
    if (firstNonEmpty(flat.topic, flat.name, flat.title)) {
      count += 1;
    }
  }

  return count;
}

function rankDigestItems(
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
    ...mapTopics(sources.topics ?? []),
  ]
    .filter((item) => item.viralScore >= options.minViralScore)
    .filter(
      (item) => allowed.size === 0 || allowed.has(item.platform.toLowerCase()),
    )
    .sort((a, b) => b.viralScore - a.viralScore);

  return options.limit == null ? ranked : ranked.slice(0, options.limit);
}

/**
 * Ranked digest rows plus how many named source topics existed before the
 * viral-score and platform gates. A zero count is an empty corpus; a positive
 * count with no items means every topic missed the configured filter.
 */
export function assembleTrendDigest(
  sources: TrendDigestSources,
  options: TrendDigestSourceOptions,
): TrendDigestAssembly {
  return {
    items: rankDigestItems(sources, options),
    sourceTopicCount: countSourceTopics(sources),
  };
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
  return assembleTrendDigest(sources, options).items;
}
