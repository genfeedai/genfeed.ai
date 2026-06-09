import type { TrendSourceItem } from '@api/collections/trends/interfaces/trend.interfaces';

export interface PrelaunchReferenceCorpusSeed {
  growthRate: number;
  key: string;
  mentions: number;
  metadata: {
    angle: string;
    hashtags: string[];
    launchCorpusSlice: string;
  };
  platform: string;
  sourcePreview: TrendSourceItem[];
  topic: string;
  viralityScore: number;
}

interface CorpusTheme {
  angle: string;
  hashtag: string;
  key: string;
  shortTitle: string;
  title: string;
}

interface CorpusPlatform {
  accountPrefix: string;
  contentType: TrendSourceItem['contentType'];
  key: string;
  label: string;
  sourcePath: (theme: CorpusTheme) => string;
  sourcePathAlt: (theme: CorpusTheme) => string;
}

export const PRELAUNCH_REFERENCE_CORPUS_VERSION = '2026-06-09';

export const PRELAUNCH_REFERENCE_CORPUS_MINIMUMS = {
  sourceReferences: 140,
  trends: 70,
} as const;

const THEMES: CorpusTheme[] = [
  {
    angle: 'AI agents turning repeatable content ops into reusable systems',
    hashtag: 'aiagents',
    key: 'ai-agent-workflows',
    shortTitle: 'AI agent workflows',
    title: 'AI agent workflow demos',
  },
  {
    angle: 'Creator teams packaging research, briefs, review, and publishing',
    hashtag: 'creatorops',
    key: 'creator-ops',
    shortTitle: 'creator ops',
    title: 'Creator ops playbooks',
  },
  {
    angle: 'Long-form assets becoming short-form hooks, clips, and captions',
    hashtag: 'shortformvideo',
    key: 'short-form-remix',
    shortTitle: 'short-form remix',
    title: 'Short-form remix systems',
  },
  {
    angle: 'Approved brand voice becoming reusable prompt and review context',
    hashtag: 'brandvoice',
    key: 'brand-voice-systems',
    shortTitle: 'brand voice systems',
    title: 'Brand voice systems',
  },
  {
    angle: 'UGC-style examples and proof hooks driving creative testing',
    hashtag: 'ugccreators',
    key: 'ugc-proof-hooks',
    shortTitle: 'UGC proof hooks',
    title: 'UGC proof hooks',
  },
  {
    angle: 'Launch teams running content sprints from insight to publish',
    hashtag: 'launchstrategy',
    key: 'launch-content-sprints',
    shortTitle: 'launch content sprints',
    title: 'Launch content sprints',
  },
  {
    angle: 'Performance analytics feeding the next batch of content briefs',
    hashtag: 'contentanalytics',
    key: 'analytics-feedback-loops',
    shortTitle: 'analytics feedback',
    title: 'Analytics feedback loops',
  },
  {
    angle: 'Local-first AI workspaces balancing privacy, sync, and speed',
    hashtag: 'localfirst',
    key: 'local-first-ai',
    shortTitle: 'local-first AI',
    title: 'Local-first AI workflows',
  },
  {
    angle: 'Paid creative examples translated into organic content lessons',
    hashtag: 'creativeanalytics',
    key: 'paid-creative-breakdowns',
    shortTitle: 'paid creative breakdowns',
    title: 'Paid creative breakdowns',
  },
  {
    angle: 'Community research threads surfacing customer language and hooks',
    hashtag: 'communityledgrowth',
    key: 'community-research',
    shortTitle: 'community research',
    title: 'Community research threads',
  },
];

const PLATFORMS: CorpusPlatform[] = [
  {
    accountPrefix: 'tiktok',
    contentType: 'video',
    key: 'tiktok',
    label: 'TikTok',
    sourcePath: (theme) => `https://www.tiktok.com/tag/${theme.hashtag}`,
    sourcePathAlt: (theme) => `https://www.tiktok.com/tag/${theme.key}`,
  },
  {
    accountPrefix: 'instagram',
    contentType: 'video',
    key: 'instagram',
    label: 'Instagram',
    sourcePath: (theme) =>
      `https://www.instagram.com/explore/tags/${theme.hashtag}/`,
    sourcePathAlt: (theme) =>
      `https://www.instagram.com/explore/tags/${theme.key}/`,
  },
  {
    accountPrefix: 'x',
    contentType: 'tweet',
    key: 'twitter',
    label: 'X / Twitter',
    sourcePath: (theme) => `https://x.com/hashtag/${theme.hashtag}`,
    sourcePathAlt: (theme) => `https://x.com/hashtag/${theme.key}`,
  },
  {
    accountPrefix: 'youtube',
    contentType: 'video',
    key: 'youtube',
    label: 'YouTube',
    sourcePath: (theme) => `https://www.youtube.com/hashtag/${theme.hashtag}`,
    sourcePathAlt: (theme) => `https://www.youtube.com/hashtag/${theme.key}`,
  },
  {
    accountPrefix: 'reddit',
    contentType: 'post',
    key: 'reddit',
    label: 'Reddit',
    sourcePath: (theme) => `https://www.reddit.com/r/${theme.hashtag}/`,
    sourcePathAlt: (theme) => `https://www.reddit.com/r/${theme.hashtag}/top/`,
  },
  {
    accountPrefix: 'pinterest',
    contentType: 'image',
    key: 'pinterest',
    label: 'Pinterest',
    sourcePath: (theme) =>
      `https://www.pinterest.com/search/pins/${theme.hashtag}/`,
    sourcePathAlt: (theme) =>
      `https://www.pinterest.com/search/pins/${theme.key}/`,
  },
  {
    accountPrefix: 'linkedin',
    contentType: 'post',
    key: 'linkedin',
    label: 'LinkedIn',
    sourcePath: (theme) =>
      `https://www.linkedin.com/feed/hashtag/${theme.hashtag}/`,
    sourcePathAlt: (theme) =>
      `https://www.linkedin.com/feed/hashtag/${theme.key}/`,
  },
];

export function buildPrelaunchReferenceCorpusSeeds(
  capturedAt: Date = new Date(),
): PrelaunchReferenceCorpusSeed[] {
  return PLATFORMS.flatMap((platform, platformIndex) =>
    THEMES.map((theme, themeIndex) => {
      const trendKey = `${platform.key}:${theme.key}`;
      const publishedAt = new Date(
        capturedAt.getTime() - (themeIndex + platformIndex + 1) * 86_400_000,
      ).toISOString();

      return {
        growthRate: 35 + themeIndex * 3 + platformIndex,
        key: trendKey,
        mentions: 18_000 + themeIndex * 2_500 + platformIndex * 1_750,
        metadata: {
          angle: theme.angle,
          hashtags: [`#${theme.hashtag}`, `#${theme.key.replace(/-/g, '')}`],
          launchCorpusSlice: 'organic-reference',
        },
        platform: platform.key,
        sourcePreview: [
          {
            authorHandle: `${platform.accountPrefix}-${theme.key}`,
            contentType: platform.contentType,
            id: `${trendKey}:primary`,
            metrics: {
              comments: 80 + themeIndex * 12,
              likes: 1_200 + platformIndex * 140 + themeIndex * 90,
              shares: 240 + themeIndex * 16,
              views: 18_000 + platformIndex * 1_500 + themeIndex * 1_100,
            },
            platform: platform.key,
            publishedAt,
            sourceUrl: platform.sourcePath(theme),
            text: theme.angle,
            title: `${theme.shortTitle} on ${platform.label}`,
          },
          {
            authorHandle: `${platform.accountPrefix}-reference-${themeIndex + 1}`,
            contentType: platform.contentType,
            id: `${trendKey}:secondary`,
            metrics: {
              comments: 45 + platformIndex * 8,
              likes: 760 + themeIndex * 75,
              shares: 150 + platformIndex * 18,
              views: 11_000 + platformIndex * 1_100 + themeIndex * 850,
            },
            platform: platform.key,
            publishedAt,
            sourceUrl: platform.sourcePathAlt(theme),
            text: `Reference example for ${theme.title.toLowerCase()} in the ${platform.label} launch corpus.`,
            title: `${theme.title}: ${platform.label} reference`,
          },
        ],
        topic: `${theme.title} on ${platform.label}`,
        viralityScore: 58 + themeIndex * 2 + platformIndex,
      };
    }),
  );
}
