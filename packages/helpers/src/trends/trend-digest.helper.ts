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
} from '../email/system-email.helper';

export type TrendDigestItemType = 'video' | 'hashtag' | 'sound' | 'topic';

export interface TrendDigestItem {
  platform: string;
  topic: string;
  viralScore: number;
  type: TrendDigestItemType;
  url?: string;
  usageCount?: number;
}

export interface TrendDigestOptions {
  /** Minimum virality score the trends were filtered for (shown in the subtitle). */
  minViralScore: number;
  /** Absolute URL the email footer links back to. Empty string omits the link. */
  appUrl?: string;
  /** Heading text. Defaults to "Your Trend Summary". */
  headerTitle?: string;
}

const DEFAULT_HEADER_TITLE = 'Your Trend Summary';

/** Human-readable compact number (1.2K / 3.4M). */
export function formatTrendCount(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
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

  lines.push(``);
  lines.push(`_Use these trends to create viral content!_`);

  return lines.join('\n');
}

/** Branded HTML email body. */
export function buildTrendDigestHtml(
  trends: TrendDigestItem[],
  options: TrendDigestOptions,
): string {
  const { minViralScore } = options;
  const headerTitle = options.headerTitle ?? DEFAULT_HEADER_TITLE;
  const appUrl = options.appUrl ?? '';

  const videos = trends.filter((trend) => trend.type === 'video');
  const hashtags = trends.filter((trend) => trend.type === 'hashtag');
  const sounds = trends.filter((trend) => trend.type === 'sound');

  const sections: string[] = [
    buildSystemEmailParagraph(`Filtered for viral score >= ${minViralScore}.`),
  ];

  if (videos.length > 0) {
    sections.push(
      '<h2 style="border-bottom:1px solid #333538;color:#f4f4f5;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">Viral Videos</h2>',
    );
    videos.slice(0, 5).forEach((video) => {
      sections.push(buildTrendRow(video, 'views'));
    });
  }

  if (hashtags.length > 0) {
    sections.push(
      '<h2 style="border-bottom:1px solid #333538;color:#f4f4f5;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">Trending Hashtags</h2>',
    );
    hashtags.slice(0, 5).forEach((hashtag) => {
      sections.push(buildTrendRow(hashtag, 'posts'));
    });
  }

  if (sounds.length > 0) {
    sections.push(
      '<h2 style="border-bottom:1px solid #333538;color:#f4f4f5;font-size:16px;line-height:22px;margin:24px 0 10px;padding:0 0 8px;">Trending Sounds</h2>',
    );
    sounds.slice(0, 5).forEach((sound) => {
      sections.push(buildTrendRow(sound, 'uses'));
    });
  }

  return buildSystemEmailHtml({
    action: appUrl ? { label: 'Open Genfeed', url: appUrl } : undefined,
    appUrl,
    bodyHtml: sections.join(''),
    preheader: `Trends filtered for viral score >= ${minViralScore}.`,
    title: headerTitle,
  });
}

function buildTrendRow(trend: TrendDigestItem, usageLabel: string): string {
  const usage = trend.usageCount
    ? `<span style="color:#8c8c96;"> - ${formatTrendCount(trend.usageCount)} ${usageLabel}</span>`
    : '';

  return `
    <div style="border-bottom:1px solid #1e2022;padding:10px 0;">
      <div style="color:#f4f4f5;font-size:14px;font-weight:700;line-height:20px;">${escapeTrendHtml(trend.topic)}</div>
      <div style="font-size:12px;line-height:18px;margin-top:4px;">
        <span style="background:#10b981;border-radius:4px;color:#050607;display:inline-block;font-weight:700;padding:2px 6px;">Score: ${trend.viralScore}</span>
        <span style="background:#20232a;border-radius:4px;color:#b4b4bc;display:inline-block;margin-left:4px;padding:2px 6px;">${escapeTrendHtml(trend.platform)}</span>${usage}
      </div>
    </div>`;
}
