import type { TrendSourceClassification } from '@api/collections/trends/interfaces/trend.interfaces';
import { buildPublicPlatformReferenceClassification } from '@api/collections/trends/utils/trend-source-classification.util';

export interface LinkedInTrendTopic {
  growthRate: number;
  mentions: number;
  metadata: {
    sampleContent?: string;
    source: 'public-reference' | 'public-scrape';
    sourceClassification?: TrendSourceClassification;
    thumbnailUrl?: string;
    trendType: 'hashtag' | 'topic';
    urls?: string[];
  };
  topic: string;
}

export interface LinkedInTrendScrapeSource {
  readonly logoUrl?: string;
  readonly recentPosts: readonly string[];
  readonly sourceUrl: string;
}

interface LinkedInTrendCandidate {
  sampleContent?: string;
  sourceUrls: Set<string>;
  thumbnailUrl?: string;
  totalSignal: number;
  uniqueSources: Set<string>;
}

const DEFAULT_LINKEDIN_TREND_SOURCE_URLS = [
  'https://www.linkedin.com/company/openai/',
  'https://www.linkedin.com/company/anthropic-ai/',
  'https://www.linkedin.com/company/hubspot/',
  'https://www.linkedin.com/company/canva/',
  'https://www.linkedin.com/company/notionhq/',
  'https://www.linkedin.com/company/figma/',
  'https://www.linkedin.com/company/linearapp/',
  'https://www.linkedin.com/company/stripe/',
] as const;

const LINKEDIN_TREND_MAX_TOPICS = 20;
const LINKEDIN_TREND_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'been',
  'between',
  'build',
  'built',
  'could',
  'first',
  'from',
  'have',
  'into',
  'just',
  'more',
  'most',
  'next',
  'only',
  'over',
  'same',
  'than',
  'that',
  'their',
  'there',
  'these',
  'they',
  'this',
  'today',
  'using',
  'what',
  'when',
  'which',
  'with',
  'your',
]);

function buildSourceClassification(input: {
  capturedAt: Date;
  confidence: TrendSourceClassification['confidence'];
  sourceLabel: string;
  sourceTopic: string;
}): TrendSourceClassification {
  return buildPublicPlatformReferenceClassification({
    capturedAt: input.capturedAt,
    confidence: input.confidence,
    platform: 'linkedin',
    sourceLabel: input.sourceLabel,
    sourceTimestamp: input.capturedAt,
    sourceTopic: input.sourceTopic,
  });
}

function calculateGrowthRate(
  candidate: LinkedInTrendCandidate,
  totalSources: number,
): number {
  const sourceCoverage =
    totalSources > 0 ? candidate.uniqueSources.size / totalSources : 0;
  const signalStrength = Math.min(candidate.totalSignal / 10, 1);

  return Math.round(sourceCoverage * 60 + signalStrength * 40);
}

function extractTrendTerms(post: string): string[] {
  const hashtags = Array.from(
    new Set(
      (post.match(/#[a-zA-Z0-9_]+/g) || []).map((value) =>
        value.trim().toLowerCase(),
      ),
    ),
  );

  if (hashtags.length > 0) {
    return hashtags.slice(0, 3);
  }

  const tokens = post
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (token) => token.length >= 4 && !LINKEDIN_TREND_STOP_WORDS.has(token),
    );

  return Array.from(new Set(tokens)).slice(0, 3);
}

function getPublicReferenceLabel(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const slug = pathParts[pathParts.length - 1] || parsed.hostname;
    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
      .trim();
  } catch {
    return sourceUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

function toReferenceTopic(sourceLabel: string, index: number): string {
  const token = sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return token ? `#${token}` : `#linkedinreference${index + 1}`;
}

export function resolveLinkedInTrendSourceUrls(configured: unknown): string[] {
  if (typeof configured === 'string' && configured.trim().length > 0) {
    const parsed = configured
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [...DEFAULT_LINKEDIN_TREND_SOURCE_URLS];
}

export function buildLinkedInLiveTrendTopics(
  scrapedSources: readonly PromiseSettledResult<LinkedInTrendScrapeSource>[],
): LinkedInTrendTopic[] {
  const candidates = new Map<string, LinkedInTrendCandidate>();
  const fulfilledSources = scrapedSources
    .filter(
      (result): result is PromiseFulfilledResult<LinkedInTrendScrapeSource> =>
        result.status === 'fulfilled',
    )
    .map((result) => result.value)
    .filter((result) => result.recentPosts.length > 0);

  if (fulfilledSources.length === 0) {
    return [];
  }

  for (const source of fulfilledSources) {
    source.recentPosts.forEach((post, index) => {
      const signalWeight = Math.max(1, source.recentPosts.length - index);
      const terms = extractTrendTerms(post);

      for (const term of terms) {
        const existing = candidates.get(term) ?? {
          sampleContent: post,
          sourceUrls: new Set<string>(),
          thumbnailUrl: source.logoUrl,
          totalSignal: 0,
          uniqueSources: new Set<string>(),
        };

        existing.sampleContent ||= post;
        existing.thumbnailUrl ||= source.logoUrl;
        existing.sourceUrls.add(source.sourceUrl);
        existing.totalSignal += signalWeight;
        existing.uniqueSources.add(source.sourceUrl);
        candidates.set(term, existing);
      }
    });
  }

  return Array.from(candidates.entries())
    .filter(([, candidate]) => candidate.totalSignal >= 2)
    .sort((left, right) => {
      const sourceCoverageDelta =
        right[1].uniqueSources.size - left[1].uniqueSources.size;
      if (sourceCoverageDelta !== 0) {
        return sourceCoverageDelta;
      }

      return right[1].totalSignal - left[1].totalSignal;
    })
    .slice(0, LINKEDIN_TREND_MAX_TOPICS)
    .map(([topic, candidate]) => ({
      growthRate: calculateGrowthRate(candidate, fulfilledSources.length),
      mentions: candidate.totalSignal,
      metadata: {
        sampleContent: candidate.sampleContent,
        source: 'public-scrape',
        sourceClassification: buildSourceClassification({
          capturedAt: new Date(),
          confidence: 'medium',
          sourceLabel: 'LinkedIn public posts',
          sourceTopic: topic,
        }),
        thumbnailUrl: candidate.thumbnailUrl,
        trendType: topic.startsWith('#') ? 'hashtag' : 'topic',
        urls: Array.from(candidate.sourceUrls),
      },
      topic,
    }));
}

export function buildLinkedInPublicReferenceTopics(
  sourceUrls: readonly string[],
): LinkedInTrendTopic[] {
  const capturedAt = new Date();
  const seenTopics = new Set<string>();

  return sourceUrls.flatMap((sourceUrl, index) => {
    const sourceLabel = getPublicReferenceLabel(sourceUrl);
    const topic = toReferenceTopic(sourceLabel, index);
    if (seenTopics.has(topic)) {
      return [];
    }
    seenTopics.add(topic);

    return [
      {
        growthRate: 20,
        mentions: 1,
        metadata: {
          sampleContent: `Public LinkedIn reference source for ${sourceLabel}.`,
          source: 'public-reference',
          sourceClassification: buildSourceClassification({
            capturedAt,
            confidence: 'low',
            sourceLabel,
            sourceTopic: topic,
          }),
          trendType: 'topic',
          urls: [sourceUrl],
        },
        topic,
      },
    ];
  });
}
