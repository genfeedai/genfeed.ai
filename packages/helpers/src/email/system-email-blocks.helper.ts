/**
 * Visual blocks for system emails: stat counters, content thumbnails, a hero
 * preview, a big-number panel, numbered steps and a callout.
 *
 * Email clients cannot run CSS variables, flexbox, SVG or JS, so every block is
 * a table with inline styles and hosted raster images. Each block returns a
 * string for `SystemEmailOptions.bodyHtml`. Image and link targets pass the
 * same http(s) allowlist as the shell; anything else is dropped, never rendered.
 */
import { escapeSystemEmailHtml } from './system-email.helper';

const HTTP_URL_PATTERN = /^https?:\/\//i;

export const EMAIL_BLOCK_COLORS = {
  border: '#333333',
  danger: '#FF6166',
  dangerSoft: '#241112',
  muted: '#949494',
  panel: '#161616',
  primary: '#EDEDED',
  secondary: '#A1A1A1',
  success: '#10B981',
  successSoft: '#0F1F19',
  warning: '#F5A524',
  warningSoft: '#231A0B',
} as const;

export type EmailTone = 'neutral' | 'success' | 'warning' | 'danger';

const TONE_STYLES: Record<EmailTone, { accent: string; soft: string }> = {
  danger: {
    accent: EMAIL_BLOCK_COLORS.danger,
    soft: EMAIL_BLOCK_COLORS.dangerSoft,
  },
  neutral: {
    accent: EMAIL_BLOCK_COLORS.primary,
    soft: EMAIL_BLOCK_COLORS.panel,
  },
  success: {
    accent: EMAIL_BLOCK_COLORS.success,
    soft: EMAIL_BLOCK_COLORS.successSoft,
  },
  warning: {
    accent: EMAIL_BLOCK_COLORS.warning,
    soft: EMAIL_BLOCK_COLORS.warningSoft,
  },
};

function esc(value: string): string {
  return escapeSystemEmailHtml(value);
}

function httpUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  return candidate && HTTP_URL_PATTERN.test(candidate) ? candidate : null;
}

function wrapLink(href: string | null, inner: string): string {
  return href
    ? `<a href="${esc(href)}" style="color:inherit;text-decoration:none;">${inner}</a>`
    : inner;
}

/** Small uppercase label above a block. */
export function buildEmailEyebrow(text: string): string {
  return `<p style="color:${EMAIL_BLOCK_COLORS.muted};font-size:11px;letter-spacing:0.08em;line-height:16px;margin:0 0 8px;text-transform:uppercase;">${esc(text)}</p>`;
}

export interface EmailStat {
  label: string;
  /** Already formatted: "12", "1,240", "Unavailable". */
  value: string;
  /** Small line under the label, e.g. "58% of created". */
  hint?: string;
  tone?: EmailTone;
}

/**
 * Width of the shell card's body: the 560px card less its 1px borders and 32px
 * side padding (`buildSystemEmailHtml`).
 */
const EMAIL_CONTENT_WIDTH_PX = 494;
const STAT_GAP_PX = 8;

/**
 * A grid of counters. Up to four tiles share a desktop row; five or more wrap
 * by threes or fours. Each tile is an inline block capped at its share of the
 * card, so a phone fits as many as the screen holds and wraps the rest instead
 * of squeezing four into 300px. Outlook desktop ignores `max-width` on a div,
 * so a conditional table rebuilds the fixed rows there.
 */
export function buildEmailStatRow(stats: readonly EmailStat[]): string {
  if (stats.length === 0) {
    return '';
  }
  const perRow =
    stats.length <= 4 ? stats.length : stats.length % 3 === 0 ? 3 : 4;
  const cellWidth = Math.floor(EMAIL_CONTENT_WIDTH_PX / perRow);
  const cells = stats.map((stat, index) => {
    const tone = TONE_STYLES[stat.tone ?? 'neutral'];
    const hint = stat.hint
      ? `<div style="color:${EMAIL_BLOCK_COLORS.muted};font-size:11px;line-height:16px;margin-top:2px;">${esc(stat.hint)}</div>`
      : '';
    const msoBreak =
      index === 0
        ? ''
        : index % perRow === 0
          ? '<!--[if mso]></td></tr><tr><td width="' +
            cellWidth +
            '" valign="top"><![endif]-->'
          : `<!--[if mso]></td><td width="${cellWidth}" valign="top"><![endif]-->`;
    return `${msoBreak}<div style="display:inline-block;max-width:${cellWidth}px;vertical-align:top;width:100%;"><div style="padding:0 ${STAT_GAP_PX}px ${STAT_GAP_PX}px 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${tone.soft};border:1px solid ${EMAIL_BLOCK_COLORS.border};border-collapse:separate;border-radius:8px;width:100%;"><tr><td style="padding:14px 10px;"><div style="color:${tone.accent};font-size:28px;font-weight:700;letter-spacing:-0.02em;line-height:32px;white-space:nowrap;">${esc(stat.value)}</div><div style="color:${EMAIL_BLOCK_COLORS.secondary};font-size:12px;line-height:18px;margin-top:4px;white-space:nowrap;">${esc(stat.label)}</div>${hint}</td></tr></table></div></div>`;
  });
  // font-size:0 drops the whitespace gap between inline blocks; the tiles'
  // bottom gap stands in for 8px of the block's 24px bottom margin.
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 ${24 - STAT_GAP_PX}px;width:100%;"><tr><td style="font-size:0;line-height:0;"><!--[if mso]><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="${cellWidth}" valign="top"><![endif]-->${cells.join('')}<!--[if mso]></td></tr></table><![endif]--></td></tr></table>`;
}

export interface EmailBigNumberInput {
  label: string;
  value: string;
  /** Caption under the number. */
  caption?: string;
  tone?: EmailTone;
}

/** One large figure on a panel: a credit balance, a purchase amount. */
export function buildEmailBigNumber(input: EmailBigNumberInput): string {
  const tone = TONE_STYLES[input.tone ?? 'neutral'];
  const caption = input.caption
    ? `<div style="color:${EMAIL_BLOCK_COLORS.secondary};font-size:13px;line-height:20px;margin-top:6px;">${esc(input.caption)}</div>`
    : '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${tone.soft};border:1px solid ${EMAIL_BLOCK_COLORS.border};border-collapse:separate;border-radius:8px;margin:0 0 24px;width:100%;"><tr><td align="center" style="padding:24px 16px;"><div style="color:${EMAIL_BLOCK_COLORS.muted};font-size:11px;letter-spacing:0.08em;line-height:16px;text-transform:uppercase;">${esc(input.label)}</div><div style="color:${tone.accent};font-size:48px;font-weight:700;letter-spacing:-0.03em;line-height:56px;margin-top:4px;">${esc(input.value)}</div>${caption}</td></tr></table>`;
}

export type EmailThumbnailKind = 'image' | 'video' | 'article' | 'audio';

export interface EmailThumbnail {
  /** Hosted raster image. Without one the tile draws a waveform, text lines or a frame by kind. */
  imageUrl?: string | null;
  kind: EmailThumbnailKind;
  /** Caption under the tile: the title or a short description. */
  label?: string;
  /** Open target for the tile. */
  href?: string | null;
  /** Small status line, e.g. "Published" or "Ready". */
  status?: string;
  statusTone?: EmailTone;
}

const KIND_LABELS: Record<EmailThumbnailKind, string> = {
  article: 'Article',
  audio: 'Audio',
  image: 'Image',
  video: 'Video',
};

const AUDIO_WAVEFORM_HEIGHTS = [
  10, 18, 28, 20, 34, 46, 30, 22, 38, 52, 36, 24, 42, 30, 18, 26, 14, 8,
] as const;
const ARTICLE_LINE_WIDTHS = [88, 100, 94, 100, 72] as const;

/** Bars of different heights, drawn with table cells so every client shows them. */
function audioTileHtml(size: number): string {
  const bars = AUDIO_WAVEFORM_HEIGHTS.map(
    (height) =>
      `<td valign="middle" style="padding:0 1px;"><div style="background:${EMAIL_BLOCK_COLORS.warning};border-radius:2px;font-size:0;height:${height}px;line-height:0;width:3px;">&nbsp;</div></td>`,
  ).join('');
  return `<div style="aspect-ratio:1/1;background:${EMAIL_BLOCK_COLORS.panel};border:1px solid ${EMAIL_BLOCK_COLORS.border};border-radius:8px;box-sizing:border-box;max-width:${size}px;overflow:hidden;width:100%;"><table role="presentation" width="100%" height="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;height:100%;width:100%;"><tr><td align="center" valign="middle" style="padding:30px 8px;"><table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr>${bars}</tr></table></td></tr></table></div>`;
}

/** Grey lines of text on a page: an article has no still to show. */
function articleTileHtml(size: number): string {
  const lines = ARTICLE_LINE_WIDTHS.map(
    (width) =>
      `<div style="background:${EMAIL_BLOCK_COLORS.border};border-radius:2px;font-size:0;height:5px;line-height:0;margin:0 0 9px;width:${width}%;">&nbsp;</div>`,
  ).join('');
  return `<div style="aspect-ratio:1/1;background:${EMAIL_BLOCK_COLORS.panel};border:1px solid ${EMAIL_BLOCK_COLORS.border};border-radius:8px;box-sizing:border-box;max-width:${size}px;overflow:hidden;width:100%;"><table role="presentation" width="100%" height="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;height:100%;width:100%;"><tr><td valign="middle" style="padding:24px 22px;"><div style="background:${EMAIL_BLOCK_COLORS.secondary};border-radius:2px;font-size:0;height:7px;line-height:0;margin:0 0 14px;width:55%;">&nbsp;</div>${lines}</td></tr></table></div>`;
}

/** An image or video whose still is not available: a quiet frame, never a word. */
function stillPlaceholderHtml(kind: EmailThumbnailKind, size: number): string {
  const glyph = kind === 'video' ? '&#9654;' : '&#9632;';
  return `<div style="aspect-ratio:1/1;background:${EMAIL_BLOCK_COLORS.panel};border:1px solid ${EMAIL_BLOCK_COLORS.border};border-radius:8px;box-sizing:border-box;max-width:${size}px;overflow:hidden;width:100%;"><table role="presentation" width="100%" height="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;height:100%;width:100%;"><tr><td align="center" valign="middle" style="color:${EMAIL_BLOCK_COLORS.border};font-size:28px;line-height:28px;padding:34px 0;">${glyph}</td></tr></table></div>`;
}

/** A URL safe to place inside an inline `url('...')`: quotes, parens and spaces are percent-encoded. */
function cssUrl(value: string): string {
  return value.replace(
    /['"()\\\s]/g,
    (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}

/**
 * Vertical padding around the play button. The aspect ratio sets the frame's
 * height and `valign` centres the button in it; this padding only keeps a
 * client without `aspect-ratio` from collapsing the tile to nothing. It is
 * small so it never forces a shrunken tile taller than its width.
 */
const VIDEO_FRAME_MIN_PADDING_PX = 20;

/** The round play button drawn over a video's first frame. */
function playButtonHtml(): string {
  return `<table role="presentation" align="center" cellspacing="0" cellpadding="0" style="border-collapse:separate;margin:0 auto;"><tr><td align="center" valign="middle" width="44" style="background:rgba(0,0,0,0.6);border:2px solid ${EMAIL_BLOCK_COLORS.primary};border-radius:24px;color:${EMAIL_BLOCK_COLORS.primary};font-size:16px;height:40px;line-height:40px;padding:0 0 0 3px;width:44px;">&#9654;</td></tr></table>`;
}

/**
 * A video's first frame with a play button on it. The frame is a background so
 * the button can sit on top: email clients drop `position`, and a negative
 * margin drifts off-centre once the tile shrinks. A client that blocks
 * background images still shows the dark tile with its play button.
 */
function videoStillHtml(
  src: string,
  frame: { aspectRatio: string; fit: 'cover' | 'contain' },
  maxWidth: number,
  label: string,
): string {
  return `<div role="img" aria-label="${esc(label)}" style="aspect-ratio:${frame.aspectRatio};background:${EMAIL_BLOCK_COLORS.panel} url('${esc(cssUrl(src))}') center/${frame.fit} no-repeat;border:1px solid ${EMAIL_BLOCK_COLORS.border};border-radius:8px;box-sizing:border-box;max-width:${maxWidth}px;overflow:hidden;width:100%;"><table role="presentation" width="100%" height="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;height:100%;width:100%;"><tr><td align="center" valign="middle" style="padding:${VIDEO_FRAME_MIN_PADDING_PX}px 0;">${playButtonHtml()}</td></tr></table></div>`;
}

function thumbnailTile(
  item: EmailThumbnail,
  size: number,
  isCompact: boolean,
): string {
  const href = httpUrl(item.href);
  const src = httpUrl(item.imageUrl);
  const kindLabel = KIND_LABELS[item.kind];
  const visual =
    src && item.kind === 'video'
      ? videoStillHtml(
          src,
          { aspectRatio: '1/1', fit: 'cover' },
          size,
          item.label ?? kindLabel,
        )
      : src
        ? `<img src="${esc(src)}" alt="${esc(item.label ?? kindLabel)}" width="${size}" height="${size}" style="aspect-ratio:1/1;background:${EMAIL_BLOCK_COLORS.panel};border:0;border-radius:8px;display:block;height:auto;max-width:${size}px;object-fit:cover;width:100%;">`
        : item.kind === 'audio'
          ? audioTileHtml(size)
          : item.kind === 'article'
            ? articleTileHtml(size)
            : stillPlaceholderHtml(item.kind, size);
  const status = item.status
    ? `<span style="color:${TONE_STYLES[item.statusTone ?? 'neutral'].accent};font-size:11px;font-weight:600;">${esc(item.status)}</span>`
    : '';
  const caption = [
    item.label && !isCompact
      ? `<div style="color:${EMAIL_BLOCK_COLORS.primary};font-size:12px;line-height:17px;margin-top:6px;overflow-wrap:anywhere;">${esc(item.label.length > 48 ? `${item.label.slice(0, 45)}...` : item.label)}</div>`
      : '',
    status
      ? `<div style="line-height:16px;margin-top:2px;">${status}</div>`
      : '',
  ].join('');
  return `${wrapLink(href, visual)}${caption}`;
}

export interface EmailThumbnailGridOptions {
  /** Tiles shown before the rest fold into the "more" line. Defaults to 6. */
  maxItems?: number;
  /** Pieces the caller left out; added to those past `maxItems`. */
  moreCount?: number;
}

/**
 * A grid of content previews, three across. A tile without an image draws its
 * kind (a waveform for audio, text lines for an article), so every piece still
 * takes a place in the grid.
 * Tiles are 152px on desktop and shrink with their cell in narrow clients.
 * `moreCount` is what the caller left out; items past `maxItems` are added to it.
 */
export function buildEmailThumbnailGrid(
  items: readonly EmailThumbnail[],
  options: EmailThumbnailGridOptions = {},
): string {
  const visible = items.slice(0, options.maxItems ?? 6);
  if (visible.length === 0) {
    return '';
  }
  const perRow = 3;
  // 496px card body, minus two 12px gutters, split three ways.
  const size = 152;
  const rows: EmailThumbnail[][] = [];
  for (let index = 0; index < visible.length; index += perRow) {
    rows.push(visible.slice(index, index + perRow));
  }
  const body = rows
    .map((row, rowIndex) => {
      const cells = Array.from({ length: perRow }, (_, cellIndex) => {
        const item = row[cellIndex];
        const gap = cellIndex === perRow - 1 ? '' : 'padding-right:12px;';
        return `<td width="33%" valign="top" style="${gap}padding-bottom:${rowIndex === rows.length - 1 ? 0 : 16}px;">${item ? thumbnailTile(item, size, false) : ''}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const hiddenCount =
    Math.max(0, options.moreCount ?? 0) + (items.length - visible.length);
  const more =
    hiddenCount > 0
      ? `<p style="color:${EMAIL_BLOCK_COLORS.muted};font-size:12px;line-height:18px;margin:12px 0 0;">+ ${hiddenCount.toLocaleString('en-US')} more in your library</p>`
      : '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed;width:100%;">${body}</table>${more}<div style="height:24px;line-height:24px;">&nbsp;</div>`;
}

export interface EmailHeroInput {
  imageUrl?: string | null;
  kind: EmailThumbnailKind;
  /** Alt text and caption. */
  label?: string;
  href?: string | null;
  /** Small line under the image: brand, platform, status. */
  meta?: string;
}

function heroPlaceholderInner(kind: EmailThumbnailKind): string {
  if (kind === 'audio') {
    const bars = AUDIO_WAVEFORM_HEIGHTS.map(
      (height) =>
        `<td valign="middle" style="padding:0 2px;"><div style="background:${EMAIL_BLOCK_COLORS.warning};border-radius:2px;font-size:0;height:${height}px;line-height:0;width:5px;">&nbsp;</div></td>`,
    ).join('');
    return `<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr>${bars}</tr></table>`;
  }
  const glyph = kind === 'video' ? '&#9654;' : '&#9632;';
  return `<span style="color:${EMAIL_BLOCK_COLORS.border};font-size:40px;line-height:40px;">${glyph}</span>`;
}

/** One large preview of the piece the email is about. */
export function buildEmailHero(input: EmailHeroInput): string {
  const src = httpUrl(input.imageUrl);
  const href = httpUrl(input.href);
  const kindLabel = KIND_LABELS[input.kind];
  const visual =
    src && input.kind === 'video'
      ? videoStillHtml(
          src,
          { aspectRatio: '16/9', fit: 'contain' },
          EMAIL_CONTENT_WIDTH_PX + 2,
          input.label ?? kindLabel,
        )
      : src
        ? `<img src="${esc(src)}" alt="${esc(input.label ?? kindLabel)}" width="496" style="background:${EMAIL_BLOCK_COLORS.panel};border:0;border-radius:8px;display:block;height:auto;max-width:100%;width:100%;">`
        : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_BLOCK_COLORS.panel};border:1px solid ${EMAIL_BLOCK_COLORS.border};border-collapse:separate;border-radius:8px;width:100%;"><tr><td align="center" valign="middle" style="height:160px;">${heroPlaceholderInner(input.kind)}</td></tr></table>`;
  const caption =
    input.label || input.meta
      ? `<p style="color:${EMAIL_BLOCK_COLORS.secondary};font-size:13px;line-height:20px;margin:8px 0 0;">${input.label ? `<span style="color:${EMAIL_BLOCK_COLORS.primary};font-weight:600;">${esc(input.label)}</span>` : ''}${input.label && input.meta ? ' &middot; ' : ''}${input.meta ? esc(input.meta) : ''}</p>`
      : '';
  return `<div style="margin:0 0 24px;">${wrapLink(href, visual)}${caption}</div>`;
}

export interface EmailCalloutInput {
  title: string;
  body?: string;
  tone?: EmailTone;
}

/** A tinted panel with a bold lead line and a sentence of detail. */
export function buildEmailCallout(input: EmailCalloutInput): string {
  const tone = TONE_STYLES[input.tone ?? 'neutral'];
  const body = input.body
    ? `<div style="color:${EMAIL_BLOCK_COLORS.secondary};font-size:14px;line-height:21px;margin-top:4px;">${esc(input.body)}</div>`
    : '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${tone.soft};border-collapse:separate;border-left:3px solid ${tone.accent};border-radius:6px;margin:0 0 24px;width:100%;"><tr><td style="padding:14px 16px;"><div style="color:${EMAIL_BLOCK_COLORS.primary};font-size:15px;font-weight:600;line-height:22px;">${esc(input.title)}</div>${body}</td></tr></table>`;
}

export interface EmailStep {
  title: string;
  detail?: string;
  isDone?: boolean;
}

/** Numbered steps with a filled marker for each finished one. */
export function buildEmailSteps(steps: readonly EmailStep[]): string {
  if (steps.length === 0) {
    return '';
  }
  const rows = steps
    .map((step, index) => {
      const marker = step.isDone ? '&#10003;' : String(index + 1);
      const markerStyle = step.isDone
        ? `background:${EMAIL_BLOCK_COLORS.success};color:#0A0A0A;`
        : `background:${EMAIL_BLOCK_COLORS.panel};border:1px solid ${EMAIL_BLOCK_COLORS.border};color:${EMAIL_BLOCK_COLORS.primary};`;
      const detail = step.detail
        ? `<div style="color:${EMAIL_BLOCK_COLORS.secondary};font-size:13px;line-height:19px;">${esc(step.detail)}</div>`
        : '';
      return `<tr><td width="36" valign="top" style="padding-bottom:14px;"><table role="presentation" width="28" height="28" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-radius:14px;height:28px;width:28px;${markerStyle}"><tr><td align="center" valign="middle" style="font-size:13px;font-weight:700;line-height:28px;">${marker}</td></tr></table></td><td valign="top" style="padding-bottom:14px;"><div style="color:${EMAIL_BLOCK_COLORS.primary};font-size:15px;font-weight:600;line-height:28px;">${esc(step.title)}</div>${detail}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 12px;width:100%;">${rows}</table>`;
}

export interface EmailKeyValue {
  label: string;
  value: string;
}

/** Label/value rows with a hairline between them: a receipt or a summary. */
export function buildEmailKeyValueRows(rows: readonly EmailKeyValue[]): string {
  if (rows.length === 0) {
    return '';
  }
  const body = rows
    .map(
      (row, index) =>
        `<tr><td style="${index === 0 ? '' : `border-top:1px solid ${EMAIL_BLOCK_COLORS.border};`}color:${EMAIL_BLOCK_COLORS.muted};font-size:13px;line-height:20px;padding:10px 0;">${esc(row.label)}</td><td align="right" style="${index === 0 ? '' : `border-top:1px solid ${EMAIL_BLOCK_COLORS.border};`}color:${EMAIL_BLOCK_COLORS.primary};font-size:13px;font-weight:600;line-height:20px;padding:10px 0;">${esc(row.value)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 24px;width:100%;">${body}</table>`;
}

/** A selectable block of monospace text: an install command, a receipt id. */
export function buildEmailCodeBlock(code: string): string {
  return `<p style="background:${EMAIL_BLOCK_COLORS.panel};border:1px solid ${EMAIL_BLOCK_COLORS.border};border-radius:8px;color:${EMAIL_BLOCK_COLORS.primary};font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:13px;line-height:20px;margin:0 0 24px;padding:14px 16px;word-break:break-all;">${esc(code)}</p>`;
}

/** A small coloured status pill. */
export function buildEmailPill(label: string, tone: EmailTone): string {
  const style = TONE_STYLES[tone];
  return `<span style="background:${style.soft};border:1px solid ${style.accent};border-radius:999px;color:${style.accent};display:inline-block;font-size:11px;font-weight:600;letter-spacing:0.04em;line-height:18px;padding:0 10px;text-transform:uppercase;">${esc(label)}</span>`;
}
