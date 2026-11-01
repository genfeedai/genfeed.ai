/**
 * Trend digest builder — pure render/format helpers shared by:
 *  - the per-user trend-summary cron (apps/server/workers)
 *  - the workflow-backed `trendDigest` node (injected into the engine via the API adapter)
 *
 * Pure functions only: no I/O, no `process.env`, no service access. All inputs
 * (trends + branding/threshold options) are passed in by the caller so this file
 * can live in a public package that the engine and workers both consume.
 */
import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
  escapeSystemEmailHtml,
  sanitizeSystemEmailUrl,
} from '../email/system-email.helper';

export type TrendDigestItemType = 'video' | 'hashtag' | 'sound' | 'topic';

/** A post the reader can make from a trend. */
export interface TrendDigestPostIdea {
  /** Content format, e.g. "Video · 30s" or "Thread · 5 posts". */
  format: string;
  hook: string;
  caption: string;
}

/** A real post behind a trend, shown as a card in the email. */
export interface TrendDigestSourcePost {
  authorHandle?: string;
  likes?: number;
  platform: string;
  text?: string;
  url: string;
  views?: number;
}

export interface TrendDigestItem {
  platform: string;
  topic: string;
  viralScore: number;
  type: TrendDigestItemType;
  url?: string;
  usageCount?: number;
  /** Why the trend fits the brand. Present when the digest is brand-scoped. */
  angle?: string;
  /** Brand niche terms the trend matched. */
  matchedTerms?: string[];
  postIdea?: TrendDigestPostIdea;
  /** Video still. Only http(s) URLs are rendered. */
  thumbnailUrl?: string;
  /** Posts from X, LinkedIn and other platforms that carry the trend. */
  posts?: TrendDigestSourcePost[];
}

export interface TrendDigestOptions {
  /** Minimum virality score the trends were filtered for (shown in the subtitle). */
  minViralScore: number;
  /** Absolute URL the email footer links back to. Empty string omits the link. */
  appUrl?: string;
  /** Heading text. Defaults to "Your Trend Summary". */
  headerTitle?: string;
  /** Brand the topics were chosen for. Shown in the email intro. */
  brandLabel?: string;
}

const DEFAULT_HEADER_TITLE = 'Your Trend Summary';

/** Human-readable compact number (1.2K / 3.4M). */
export function formatTrendCount(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return num.toString();
}

/** Escapes a string for safe interpolation into the digest HTML. */
export function escapeTrendHtml(text: string): string {
  return escapeSystemEmailHtml(text);
}

/** Markdown summary (used for chat/Telegram channels). */
export function buildTrendDigestMessage(
  trends: TrendDigestItem[],
  options: TrendDigestOptions,
): string {
  const { minViralScore } = options;
  const lines: string[] = [
    `*${options.headerTitle ?? DEFAULT_HEADER_TITLE}*`,
    `_Filtered for viral score >= ${minViralScore}_`,
    ``,
  ];

  const videos = trends.filter((trend) => trend.type === 'video');
  const hashtags = trends.filter((trend) => trend.type === 'hashtag');
  const sounds = trends.filter((trend) => trend.type === 'sound');
  const topics = trends.filter((trend) => trend.type === 'topic');

  if (videos.length > 0) {
    lines.push(`*Viral Videos:*`);
    videos.slice(0, 5).forEach((video, index) => {
      lines.push(
        `${index + 1}. ${video.topic} (${video.platform}, score: ${video.viralScore})`,
      );
    });
    lines.push(``);
  }

  if (hashtags.length > 0) {
    lines.push(`*Trending Hashtags:*`);
    hashtags.slice(0, 5).forEach((hashtag, index) => {
      const count = hashtag.usageCount
        ? ` - ${formatTrendCount(hashtag.usageCount)} posts`
        : '';
      lines.push(`${index + 1}. ${hashtag.topic}${count}`);
    });
    lines.push(``);
  }

  if (sounds.length > 0) {
    lines.push(`*Trending Sounds:*`);
    sounds.slice(0, 5).forEach((sound, index) => {
      const count = sound.usageCount
        ? ` - ${formatTrendCount(sound.usageCount)} uses`
        : '';
      lines.push(`${index + 1}. ${sound.topic}${count}`);
    });
  }

  if (topics.length > 0) {
    lines.push(`*Trending Topics:*`);
    topics.slice(0, 5).forEach((topic, index) => {
      const count = topic.usageCount
        ? ` - ${formatTrendCount(topic.usageCount)} mentions`
        : '';
      lines.push(
        `${index + 1}. ${topic.topic} (${topic.platform}, score: ${topic.viralScore})${count}`,
      );
    });
  }

  lines.push(``);
  lines.push(`_Use these trends to create viral content!_`);

  return lines.join('\n');
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  twitter: 'X',
  youtube: 'YouTube',
};

/** The name readers know the platform by; unknown platforms pass through. */
function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform.toLowerCase()] ?? platform;
}

/** Drafts shown under "Ready to post today". */
const DIGEST_DRAFT_LIMIT = 3;

const COLORS = {
  border: '#333333',
  card: '#0A0A0A',
  chip: '#1C1C1C',
  mute: '#949494',
  pop: '#10B981',
  soft: '#0F1F19',
  sub: '#A1A1A1',
  text: '#EDEDED',
} as const;

/** Row links are web sources only — narrower than the system-email allowlist. */
function sanitizeTrendSourceUrl(value: string): string | null {
  const safe = sanitizeSystemEmailUrl(value);
  if (!safe) {
    return null;
  }
  return /^https?:\/\//i.test(safe) ? safe : null;
}

function safeUrl(value: string | undefined): string | null {
  return value ? sanitizeTrendSourceUrl(value) : null;
}

function eyebrowHtml(text: string, color: string = COLORS.mute): string {
  return `<div style="color:${color};font-size:11px;letter-spacing:0.08em;line-height:16px;text-transform:uppercase;">${escapeTrendHtml(text)}</div>`;
}

function linked(
  url: string | null,
  inner: string,
  color: string = COLORS.text,
): string {
  return url
    ? `<a href="${escapeTrendHtml(url)}" style="color:${color};text-decoration:none;">${inner}</a>`
    : inner;
}

function metaHtml(trend: TrendDigestItem): string {
  const parts = [escapeTrendHtml(platformLabel(trend.platform))];
  if (trend.usageCount) {
    parts.push(`${formatTrendCount(trend.usageCount)} views`);
  }
  return `<div style="color:${COLORS.mute};font-size:12px;line-height:18px;">${parts.join(' &middot; ')}</div>`;
}

function chipsHtml(terms: string[] | undefined): string {
  if (!terms?.length) {
    return '';
  }
  return `<div style="line-height:24px;">${terms
    .slice(0, 4)
    .map(
      (term) =>
        `<span style="background:${COLORS.soft};border-radius:4px;color:${COLORS.pop};display:inline-block;font-size:12px;line-height:20px;margin:0 6px 0 0;padding:0 7px;">${escapeTrendHtml(term)}</span>`,
    )
    .join('')}</div>`;
}

/** The video still, linked to the source. Anything but an http(s) image is dropped. */
function thumbnailHtml(trend: TrendDigestItem, width: number): string {
  const src = safeUrl(trend.thumbnailUrl);
  if (!src) {
    return '';
  }
  const height = Math.round((width * 9) / 16);
  const img = `<img src="${escapeTrendHtml(src)}" alt="${escapeTrendHtml(trend.topic)}" width="${width}" height="${height}" style="background:${COLORS.chip};border:0;border-radius:6px;display:block;height:auto;max-width:100%;width:${width}px;">`;
  return linked(safeUrl(trend.url), img);
}

/** A post from X, LinkedIn or another platform, drawn as a card. Mail clients cannot run embed scripts. */
function postCardHtml(post: TrendDigestSourcePost): string {
  const url = safeUrl(post.url);
  const stats = [
    post.views ? `${formatTrendCount(post.views)} views` : null,
    post.likes ? `${formatTrendCount(post.likes)} likes` : null,
  ].filter((part): part is string => part !== null);
  const text = post.text?.trim();
  return `
    <div style="border:1px solid ${COLORS.border};border-radius:8px;padding:12px;">
      <div style="color:${COLORS.text};font-size:13px;font-weight:600;line-height:20px;">${escapeTrendHtml(post.authorHandle ?? platformLabel(post.platform))}<span style="color:${COLORS.mute};font-weight:400;"> &middot; ${escapeTrendHtml(platformLabel(post.platform))}</span></div>
      ${text ? `<div style="color:${COLORS.text};font-size:14px;line-height:21px;margin-top:4px;">${escapeTrendHtml(text.length > 280 ? `${text.slice(0, 277)}...` : text)}</div>` : ''}
      <div style="color:${COLORS.mute};font-size:12px;line-height:18px;margin-top:6px;">${[...stats.map(escapeTrendHtml), linked(url, 'View post', COLORS.sub)].join(' &middot; ')}</div>
    </div>`;
}

function ideaHtml(trend: TrendDigestItem, background: string): string {
  const idea = trend.postIdea;
  if (!idea) {
    return '';
  }
  return `
    <div style="background:${background};border-radius:6px;padding:12px 14px;">
      ${eyebrowHtml(`Post idea · ${idea.format}`, COLORS.pop)}
      <div style="color:${COLORS.text};font-size:14px;font-weight:600;line-height:21px;margin-top:2px;">${escapeTrendHtml(idea.hook)}</div>
      <div style="color:${COLORS.sub};font-size:14px;line-height:21px;">${escapeTrendHtml(idea.caption)}</div>
    </div>`;
}

function stack(blocks: string[], gap: number): string {
  return blocks
    .filter((block) => block.trim().length > 0)
    .map(
      (block, index) =>
        `<div style="margin-top:${index === 0 ? 0 : gap}px;">${block}</div>`,
    )
    .join('');
}

function leadHtml(trend: TrendDigestItem, appUrl: string): string {
  const action = safeUrl(appUrl)
    ? `<a href="${escapeTrendHtml(appUrl)}" style="background:${COLORS.text};border-radius:6px;color:#0A0A0A;display:inline-block;font-size:14px;font-weight:600;line-height:20px;padding:10px 16px;text-decoration:none;">Create this post</a>`
    : '';
  return `
    <div style="background:${COLORS.soft};border-radius:8px;padding:16px;">
      ${stack(
        [
          eyebrowHtml('Lead story', COLORS.pop),
          thumbnailHtml(trend, 462),
          `<div style="color:${COLORS.text};font-size:20px;font-weight:600;line-height:26px;">${linked(safeUrl(trend.url), escapeTrendHtml(trend.topic))}</div>`,
          metaHtml(trend),
          chipsHtml(trend.matchedTerms),
          trend.angle
            ? `<div style="color:${COLORS.sub};font-size:14px;line-height:21px;">${escapeTrendHtml(trend.angle)}</div>`
            : '',
          ideaHtml(trend, COLORS.card),
          action,
        ],
        12,
      )}
    </div>`;
}

function draftHtml(trend: TrendDigestItem): string {
  const idea = trend.postIdea;
  if (!idea) {
    return '';
  }
  return `
    <div style="border:1px solid ${COLORS.border};border-radius:8px;padding:14px;">
      ${eyebrowHtml(`${platformLabel(trend.platform)} · ${idea.format}`)}
      <div style="color:${COLORS.text};font-size:14px;line-height:21px;margin-top:6px;white-space:pre-line;">${escapeTrendHtml(`${idea.hook}\n\n${idea.caption}`)}</div>
      <div style="color:${COLORS.mute};font-size:12px;line-height:18px;margin-top:8px;">From: ${escapeTrendHtml(trend.topic)}</div>
    </div>`;
}

function moreRowHtml(trend: TrendDigestItem, hasDraft: boolean): string {
  const url = safeUrl(trend.url);
  const thumb = thumbnailHtml(trend, 112);
  const post = trend.posts?.[0];
  const text = stack(
    [
      `<div style="color:${COLORS.text};font-size:15px;font-weight:600;line-height:21px;">${linked(url, escapeTrendHtml(trend.topic))}</div>`,
      metaHtml(trend),
      chipsHtml(trend.matchedTerms),
      post ? postCardHtml(post) : '',
      trend.angle
        ? `<div style="color:${COLORS.sub};font-size:13px;line-height:19px;">${escapeTrendHtml(trend.angle)}</div>`
        : '',
      trend.postIdea && !hasDraft
        ? `<div style="color:${COLORS.sub};font-size:13px;line-height:19px;"><span style="color:${COLORS.text};font-weight:600;">${escapeTrendHtml(trend.postIdea.format)}</span> &middot; ${escapeTrendHtml(trend.postIdea.hook)}</div>`
        : '',
    ],
    6,
  );
  // Small still beside the text; a post card takes the full row width instead.
  const body =
    thumb && !post
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr><td width="112" valign="top" style="padding-right:12px;">${thumb}</td><td valign="top">${text}</td></tr></table>`
      : text;
  return `<div style="border-top:1px solid ${COLORS.border};padding:14px 0;">${body}</div>`;
}

/** The lead story's own idea plus the drafts queued after it. */
function readyPostCount(trends: TrendDigestItem[]): number {
  const [lead, ...rest] = trends;
  return (lead?.postIdea ? 1 : 0) + queuedDrafts(rest).length;
}

/** Topics after the lead whose idea is shown as a draft, not repeated in the rows. */
function queuedDrafts(rest: TrendDigestItem[]): TrendDigestItem[] {
  return rest.filter((trend) => trend.postIdea).slice(0, DIGEST_DRAFT_LIMIT);
}

/** Email subject: lead with the posts the reader can make, not the count of trends. */
export function buildTrendDigestSubject(trends: TrendDigestItem[]): string {
  const drafts = readyPostCount(trends);
  const topics = `${trends.length} ${trends.length === 1 ? 'topic' : 'topics'}`;
  if (drafts > 0) {
    return `${drafts} ${drafts === 1 ? 'post' : 'posts'} ready for today, from ${topics} in your niche`;
  }
  return `Your daily trends — ${topics}`;
}

/** Branded HTML email body: a lead story, drafts ready to post, then more topics. */
export function buildTrendDigestHtml(
  trends: TrendDigestItem[],
  options: TrendDigestOptions,
): string {
  const headerTitle = options.headerTitle ?? DEFAULT_HEADER_TITLE;
  const appUrl = options.appUrl ?? '';
  const [lead, ...rest] = trends;
  const drafts = queuedDrafts(rest);
  const readyPosts = readyPostCount(trends);
  const topicCount = `${trends.length} ${trends.length === 1 ? 'topic' : 'topics'}`;
  const intro = options.brandLabel
    ? `${topicCount} moving in the ${options.brandLabel} niche${readyPosts > 0 ? `, ${readyPosts} ${readyPosts === 1 ? 'post' : 'posts'} ready for today` : ''}.`
    : `${topicCount} trending today.`;

  const sections: string[] = [buildSystemEmailParagraph(intro)];

  if (lead) {
    sections.push(leadHtml(lead, appUrl));
  }
  if (drafts.length > 0) {
    sections.push(
      `<div style="margin-top:24px;">${stack(
        [eyebrowHtml('Ready to post today'), ...drafts.map(draftHtml)],
        10,
      )}</div>`,
    );
  }
  if (rest.length > 0) {
    sections.push(
      `<div style="margin-top:24px;">${eyebrowHtml('Also moving in your niche')}<div style="margin-top:8px;">${rest.map((trend) => moreRowHtml(trend, drafts.includes(trend))).join('')}</div></div>`,
    );
  }

  return buildSystemEmailHtml({
    action: appUrl ? { label: 'Open Genfeed', url: appUrl } : undefined,
    appUrl,
    bodyHtml: sections.join(''),
    preheader: lead ? (lead.angle ?? lead.topic) : intro,
    title: headerTitle,
  });
}
