/**
 * Trend digest builder — pure render/format helpers shared by:
 *  - the per-user trend-summary cron (apps/server/workers)
 *  - the workflow-backed `trendDigest` node (injected into the engine via the API adapter)
 *
 * Pure functions only: no I/O, no `process.env`, no service access. All inputs
 * (trends + branding/threshold options) are passed in by the caller so this file
 * can live in a public package that the engine and workers both consume.
 */

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
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px; }
          h1 { color: #1a1a1a; margin-bottom: 8px; }
          .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
          .section { margin-bottom: 24px; }
          .section-title { font-size: 16px; font-weight: 600; color: #333; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #eee; }
          .trend-item { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
          .trend-item:last-child { border-bottom: none; }
          .trend-name { font-weight: 500; color: #1a1a1a; }
          .trend-meta { font-size: 12px; color: #888; margin-top: 4px; }
          .viral-score { display: inline-block; background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
          .platform { display: inline-block; background: #e5e7eb; color: #374151; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 4px; }
          .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>${escapeTrendHtml(headerTitle)}</h1>
          <p class="subtitle">Filtered for viral score >= ${minViralScore}</p>
    `;

  if (videos.length > 0) {
    html += `<div class="section"><div class="section-title">Viral Videos</div>`;
    videos.slice(0, 5).forEach((video) => {
      html += `
          <div class="trend-item">
            <div class="trend-name">${escapeTrendHtml(video.topic)}</div>
            <div class="trend-meta">
              <span class="viral-score">Score: ${video.viralScore}</span>
              <span class="platform">${escapeTrendHtml(video.platform)}</span>
              ${video.usageCount ? `<span> • ${formatTrendCount(video.usageCount)} views</span>` : ''}
            </div>
          </div>
        `;
    });
    html += `</div>`;
  }

  if (hashtags.length > 0) {
    html += `<div class="section"><div class="section-title">Trending Hashtags</div>`;
    hashtags.slice(0, 5).forEach((hashtag) => {
      html += `
          <div class="trend-item">
            <div class="trend-name">${escapeTrendHtml(hashtag.topic)}</div>
            <div class="trend-meta">
              <span class="platform">${escapeTrendHtml(hashtag.platform)}</span>
              ${hashtag.usageCount ? `<span> • ${formatTrendCount(hashtag.usageCount)} posts</span>` : ''}
            </div>
          </div>
        `;
    });
    html += `</div>`;
  }

  if (sounds.length > 0) {
    html += `<div class="section"><div class="section-title">Trending Sounds</div>`;
    sounds.slice(0, 5).forEach((sound) => {
      html += `
          <div class="trend-item">
            <div class="trend-name">${escapeTrendHtml(sound.topic)}</div>
            <div class="trend-meta">
              ${sound.usageCount ? `<span>${formatTrendCount(sound.usageCount)} uses</span>` : ''}
            </div>
          </div>
        `;
    });
    html += `</div>`;
  }

  html += `
          <div class="footer">
            Use these trends to create viral content!<br>
            ${appUrl ? `<a href="${escapeTrendHtml(appUrl)}">Open Genfeed</a>` : ''}
          </div>
        </div>
      </body>
      </html>
    `;

  return html;
}
