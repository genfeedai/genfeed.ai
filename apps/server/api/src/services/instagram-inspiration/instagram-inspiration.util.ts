import type { ApifyInstagramPost } from '@api/services/integrations/apify/interfaces/apify.interfaces';
import type {
  InstagramInspirationAccount,
  InstagramInspirationBrandContext,
  InstagramInspirationMediaType,
  InstagramInspirationPost,
  InstagramInspirationSignals,
  InstagramInspirationSort,
  InstagramRemixMode,
} from '@genfeedai/interfaces';

const MAX_SEEDS = 5;
const CAPTION_SNIPPET_LENGTH = 160;
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

interface RankedCandidate {
  matchedSeeds: Set<string>;
  posts: Map<string, InstagramInspirationPost>;
  username: string;
}

export interface InstagramSeedInput {
  hashtags?: string[];
  niche?: string;
}

export interface InstagramSeedResult {
  niche: string;
  seeds: string[];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeInstagramUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export function normalizeInstagramSeed(value: string): string {
  return value
    .trim()
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '');
}

function uniqueSeeds(values: string[]): string[] {
  return [...new Set(values.map(normalizeInstagramSeed).filter(Boolean))].slice(
    0,
    MAX_SEEDS,
  );
}

export function deriveInstagramSeeds(
  input: InstagramSeedInput,
  brand: InstagramInspirationBrandContext,
): InstagramSeedResult {
  const explicitHashtags = uniqueSeeds(input.hashtags ?? []);
  const nicheSeeds = uniqueSeeds(
    (input.niche ?? '')
      .split(/[,\n]/)
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const brandSeeds = uniqueSeeds([
    ...brand.topics,
    ...brand.hashtags,
    ...brand.messagingPillars,
  ]);
  const seeds = uniqueSeeds([
    ...explicitHashtags,
    ...nicheSeeds,
    ...brandSeeds,
  ]);

  return {
    niche:
      normalizeWhitespace(input.niche ?? '') ||
      brand.topics[0] ||
      brand.messagingPillars[0] ||
      brand.description ||
      brand.label,
    seeds,
  };
}

function toValidDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildPermalink(shortcode: string, isVideo: boolean): string {
  const path = isVideo ? 'reel' : 'p';
  return `https://www.instagram.com/${path}/${encodeURIComponent(shortcode)}/`;
}

export function normalizeInstagramPost(
  post: ApifyInstagramPost,
  matchedSeeds: string[] = [],
): InstagramInspirationPost | null {
  const ownerUsername = normalizeInstagramUsername(post.ownerUsername ?? '');
  const shortcode = String(post.shortCode ?? '').trim();
  const id = String(post.id ?? '').trim();

  if (!ownerUsername || !shortcode || !id) {
    return null;
  }

  const likes = Math.max(0, Number(post.likesCount ?? 0));
  const comments = Math.max(0, Number(post.commentsCount ?? 0));
  const views = Math.max(0, Number(post.videoViewCount ?? 0));
  const isVideo = Boolean(post.videoUrl);
  const publishedAt = toValidDate(post.timestamp)?.toISOString();
  const caption = normalizeWhitespace(post.caption ?? '');

  return {
    captionSnippet: caption
      ? caption.slice(0, CAPTION_SNIPPET_LENGTH)
      : undefined,
    comments,
    engagement: likes + comments,
    id,
    imageUrl: post.imageUrl,
    isVideo,
    likes,
    matchedSeeds: uniqueSeeds(matchedSeeds),
    ownerUsername,
    permalink: buildPermalink(shortcode, isVideo),
    publishedAt,
    shortcode,
    videoUrl: post.videoUrl,
    views,
  };
}

export function filterInstagramPosts(
  posts: InstagramInspirationPost[],
  mediaType: InstagramInspirationMediaType,
): InstagramInspirationPost[] {
  if (mediaType === 'reels') {
    return posts.filter((post) => post.isVideo);
  }
  if (mediaType === 'posts') {
    return posts.filter((post) => !post.isVideo);
  }
  return posts;
}

export function sortInstagramPosts(
  posts: InstagramInspirationPost[],
  sort: InstagramInspirationSort,
): InstagramInspirationPost[] {
  return [...posts].sort((left, right) => {
    if (sort === 'top') {
      return (
        right.engagement - left.engagement ||
        right.views - left.views ||
        String(right.publishedAt ?? '').localeCompare(left.publishedAt ?? '')
      );
    }

    return (
      (toValidDate(right.publishedAt)?.getTime() ?? 0) -
        (toValidDate(left.publishedAt)?.getTime() ?? 0) ||
      right.engagement - left.engagement
    );
  });
}

function getRecencyScore(publishedAt: string | undefined, now: Date): number {
  const timestamp = toValidDate(publishedAt)?.getTime();
  if (!timestamp) {
    return 0;
  }

  const age = Math.max(0, now.getTime() - timestamp);
  return Math.max(0, 1 - age / RECENCY_WINDOW_MS);
}

export function rankInstagramAccounts(input: {
  mediaType: InstagramInspirationMediaType;
  now?: Date;
  ownUsername?: string;
  postsBySeed: Array<{ posts: ApifyInstagramPost[]; seed: string }>;
  seeds: string[];
  sort: InstagramInspirationSort;
}): InstagramInspirationAccount[] {
  const candidates = new Map<string, RankedCandidate>();
  const ownUsername = normalizeInstagramUsername(input.ownUsername ?? '');

  for (const group of input.postsBySeed) {
    for (const rawPost of group.posts) {
      const post = normalizeInstagramPost(rawPost, [group.seed]);
      if (!post || post.ownerUsername === ownUsername) {
        continue;
      }

      const candidate = candidates.get(post.ownerUsername) ?? {
        matchedSeeds: new Set<string>(),
        posts: new Map<string, InstagramInspirationPost>(),
        username: post.ownerUsername,
      };
      candidate.matchedSeeds.add(normalizeInstagramSeed(group.seed));
      const existing = candidate.posts.get(post.id);
      candidate.posts.set(post.id, {
        ...(existing ?? post),
        matchedSeeds: uniqueSeeds([
          ...(existing?.matchedSeeds ?? []),
          ...post.matchedSeeds,
        ]),
      });
      candidates.set(candidate.username, candidate);
    }
  }

  const now = input.now ?? new Date();
  const prepared = [...candidates.values()]
    .map((candidate) => {
      const posts = sortInstagramPosts(
        filterInstagramPosts([...candidate.posts.values()], input.mediaType),
        input.sort,
      );
      const averageEngagement =
        posts.length === 0
          ? 0
          : posts.reduce((total, post) => total + post.engagement, 0) /
            posts.length;
      return {
        averageEngagement,
        candidate,
        latestPostAt: posts
          .map((post) => post.publishedAt)
          .filter((value): value is string => Boolean(value))
          .sort((left, right) => right.localeCompare(left))[0],
        posts,
      };
    })
    .filter((candidate) => candidate.posts.length > 0);
  const maxEngagement = Math.max(
    1,
    ...prepared.map((candidate) => candidate.averageEngagement),
  );

  return prepared
    .map(({ averageEngagement, candidate, latestPostAt, posts }) => {
      const relevance =
        candidate.matchedSeeds.size / Math.max(1, input.seeds.length);
      const engagement = averageEngagement / maxEngagement;
      const recency = getRecencyScore(latestPostAt, now);

      return {
        averageEngagement: Math.round(averageEngagement),
        latestPostAt,
        matchedSeeds: [...candidate.matchedSeeds].sort(),
        posts: posts.slice(0, 3),
        score: Math.round(
          (relevance * 0.5 + engagement * 0.3 + recency * 0.2) * 100,
        ),
        username: candidate.username,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.averageEngagement - left.averageEngagement ||
        left.username.localeCompare(right.username),
    );
}

export function analyzeInstagramSignals(
  posts: InstagramInspirationPost[],
): InstagramInspirationSignals {
  const hooks = new Set<string>();
  const formats = new Set<string>();
  const pacing = new Set<string>();
  const styles = new Set<string>();

  for (const post of posts) {
    const caption = (post.captionSnippet ?? '').toLowerCase();
    if (/\?/.test(caption)) hooks.add('Question-led opening');
    if (/\bhow to\b|\btutorial\b/.test(caption)) hooks.add('How-to promise');
    if (/\bbefore\b.*\bafter\b|\btransformation\b/.test(caption))
      hooks.add('Transformation reveal');
    if (/^\d+\b|\b\d+ (ways|tips|steps)\b/.test(caption))
      hooks.add('List-led opening');
    if (hooks.size === 0) hooks.add('Direct value proposition');

    formats.add(post.isVideo ? 'Short-form vertical video' : 'Static visual');
    pacing.add(
      post.isVideo
        ? 'Fast opening followed by compact proof beats'
        : 'Single-frame message with caption-led depth',
    );
    if (/\bbehind the scenes\b|\bbts\b/.test(caption))
      styles.add('Behind-the-scenes authenticity');
    if (/\bhow to\b|\btutorial\b|\btips\b/.test(caption))
      styles.add('Educational demonstration');
    if (/\bproduct\b|\breview\b|\bunboxing\b/.test(caption))
      styles.add('Product demonstration');
    if (/\bstory\b|\bjourney\b/.test(caption))
      styles.add('Personal storytelling');
    if (/\bfunny\b|\bhumor\b|\bcomedy\b/.test(caption))
      styles.add('Lightweight humor');
  }

  if (styles.size === 0) styles.add('Platform-native social storytelling');

  return {
    formats: [...formats],
    hooks: [...hooks],
    pacing: [...pacing],
    styles: [...styles],
  };
}

export function buildInstagramRemixPrompt(input: {
  brand: InstagramInspirationBrandContext;
  mode: InstagramRemixMode;
  notes?: string;
  signals: InstagramInspirationSignals;
}): string {
  const modeDirection: Record<InstagramRemixMode, string> = {
    inspired_by:
      'Use the observed creative structure as loose inspiration while making the concept clearly original.',
    match_closely:
      'Match the high-level pacing and format closely without copying wording, identities, footage, or distinctive creative elements.',
    remix_concept:
      'Take the underlying communication pattern in a substantially different creative direction.',
  };
  const brandDirection = [
    input.brand.tone ? `tone: ${input.brand.tone}` : '',
    input.brand.style ? `style: ${input.brand.style}` : '',
    input.brand.audience.length > 0
      ? `audience: ${input.brand.audience.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('; ');

  return [
    `Create an original 9:16 Instagram Reel for ${input.brand.label}.`,
    modeDirection[input.mode],
    `Hook patterns: ${input.signals.hooks.join(', ')}.`,
    `Format: ${input.signals.formats.join(', ')}.`,
    `Pacing: ${input.signals.pacing.join(', ')}.`,
    `Visual direction: ${input.signals.styles.join(', ')}.`,
    brandDirection ? `Brand direction: ${brandDirection}.` : '',
    input.notes?.trim()
      ? `Original creative direction: ${input.notes.trim()}.`
      : '',
    'Do not copy the source caption, script, creator identity, footage, watermark, product names, or distinctive visual assets.',
  ]
    .filter(Boolean)
    .join(' ');
}
