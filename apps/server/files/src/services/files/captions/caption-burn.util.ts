import { resolveFontFile } from '@files/helpers/utils/font/font-file.util';
import { escapeDrawtextValue } from '@files/helpers/utils/string/string.util';
import type {
  CaptionBurnPosition,
  ICaptionBurnStyle,
} from '@genfeedai/contracts';

export interface CaptionCue {
  endMs: number;
  startMs: number;
  text: string;
}

export interface ResolvedCaptionBurnStyle {
  backgroundColor: string | null;
  backgroundOpacity: number;
  bottomAnchorRatio: number;
  fontColor: string;
  fontFamily: string | undefined;
  fontSizeRatio: number;
  maxLines: number;
  maxWordsPerGroup: number;
  position: CaptionBurnPosition;
  textCase: 'as-is' | 'upper';
}

/** Used for every field a caller leaves out. */
export const DEFAULT_CAPTION_BURN_STYLE: ResolvedCaptionBurnStyle = {
  backgroundColor: null,
  backgroundOpacity: 0.96,
  bottomAnchorRatio: 0.8,
  fontColor: '#FFFFFF',
  fontFamily: undefined,
  fontSizeRatio: 0.058,
  maxLines: 2,
  maxWordsPerGroup: 6,
  position: 'bottom',
  textCase: 'as-is',
};

/** More groups than this make a filter script no encode should wait for. */
export const MAX_CAPTION_GROUPS = 1500;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const POSITIONS = new Set<string>(['top', 'center', 'bottom']);
// Average glyph advance as a share of the font size, measured on the widest
// shipped fonts. Wrapping only needs a safe upper bound; capitals run wider.
const AVERAGE_GLYPH_EM = 0.55;
const AVERAGE_UPPERCASE_GLYPH_EM = 0.72;
const LINE_PITCH_EM = 1.39;
const BAND_PADDING_EM = 0.42;
const SIDE_MARGIN_RATIO = 0.06;
const MIN_GROUP_MS = 400;
// A straight apostrophe cannot sit inside a quoted filter value: the graph
// parser ends the quote at it before the option parser sees any escape. The
// typographic apostrophe reads the same on screen.

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function resolveCaptionBurnStyle(
  style?: ICaptionBurnStyle | null,
): ResolvedCaptionBurnStyle {
  const defaults = DEFAULT_CAPTION_BURN_STYLE;
  const input = style ?? {};
  return {
    backgroundColor:
      typeof input.backgroundColor === 'string' &&
      HEX_COLOR.test(input.backgroundColor)
        ? input.backgroundColor
        : defaults.backgroundColor,
    backgroundOpacity: clamp(
      numberOr(input.backgroundOpacity, defaults.backgroundOpacity),
      0,
      1,
    ),
    bottomAnchorRatio: clamp(
      numberOr(input.bottomAnchorRatio, defaults.bottomAnchorRatio),
      0.5,
      0.95,
    ),
    fontColor:
      typeof input.fontColor === 'string' && HEX_COLOR.test(input.fontColor)
        ? input.fontColor
        : defaults.fontColor,
    fontFamily:
      typeof input.fontFamily === 'string' ? input.fontFamily : undefined,
    fontSizeRatio: clamp(
      numberOr(input.fontSizeRatio, defaults.fontSizeRatio),
      0.02,
      0.12,
    ),
    maxLines: Math.round(
      clamp(numberOr(input.maxLines, defaults.maxLines), 1, 3),
    ),
    maxWordsPerGroup: Math.round(
      clamp(numberOr(input.maxWordsPerGroup, defaults.maxWordsPerGroup), 1, 12),
    ),
    position:
      typeof input.position === 'string' && POSITIONS.has(input.position)
        ? input.position
        : defaults.position,
    textCase: input.textCase === 'upper' ? 'upper' : defaults.textCase,
  };
}

function parseSrtTime(time: string): number {
  const [hour, minute, rest = '0,0'] = time.trim().split(':');
  const [second, milli = '0'] = rest.split(/[,.]/);
  return (
    Number(hour) * 3_600_000 +
    Number(minute) * 60_000 +
    Number(second) * 1000 +
    Number(milli.padEnd(3, '0').slice(0, 3))
  );
}

export function parseSrtCues(srt: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const block of srt.trim().split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length > 0 && /^\d+$/.test(lines[0])) lines.shift();
    const timeLine = lines.shift();
    if (!timeLine?.includes('-->')) continue;
    const [start, end] = timeLine.split('-->');
    const startMs = parseSrtTime(start);
    const endMs = parseSrtTime(end);
    const text = lines
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    if (endMs <= startMs) continue;
    cues.push({ endMs, startMs, text });
  }
  return cues;
}

function wrapWords(words: string[], charBudget: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > charBudget) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface CaptionGroup {
  endMs: number;
  lines: string[];
  startMs: number;
}

/**
 * Splits cues into short groups that fit `maxLines` lines of `charBudget`
 * characters. A cue longer than that is divided by words; time is shared by
 * character count so each group follows the speech.
 */
export function groupCaptionCues(
  cues: CaptionCue[],
  style: ResolvedCaptionBurnStyle,
  charBudget: number,
): CaptionGroup[] {
  const groups: CaptionGroup[] = [];

  const place = (words: string[], startMs: number, endMs: number): void => {
    const lines = wrapWords(words, charBudget);
    if (lines.length > style.maxLines && words.length > 1) {
      const middle = Math.ceil(words.length / 2);
      const first = words.slice(0, middle);
      const second = words.slice(middle);
      const firstLength = first.join(' ').length;
      const total = firstLength + second.join(' ').length;
      const split = Math.round(
        startMs + ((endMs - startMs) * firstLength) / total,
      );
      place(first, startMs, split);
      place(second, split, endMs);
      return;
    }
    groups.push({
      endMs: Math.max(endMs, startMs + MIN_GROUP_MS),
      lines: lines.slice(0, style.maxLines),
      startMs,
    });
  };

  for (const cue of cues) {
    const text = style.textCase === 'upper' ? cue.text.toUpperCase() : cue.text;
    const words = text.split(' ').filter(Boolean);
    const parts = Math.ceil(words.length / style.maxWordsPerGroup);
    const size = Math.ceil(words.length / Math.max(1, parts));
    const chunks: string[][] = [];
    for (let index = 0; index < words.length; index += size) {
      chunks.push(words.slice(index, index + size));
    }
    const total = chunks.reduce(
      (sum, chunk) => sum + chunk.join(' ').length,
      0,
    );
    let cursor = cue.startMs;
    for (const [index, chunk] of chunks.entries()) {
      const isLast = index === chunks.length - 1;
      const share = chunk.join(' ').length / total;
      const end = isLast
        ? cue.endMs
        : Math.round(cursor + (cue.endMs - cue.startMs) * share);
      place(chunk, cursor, end);
      cursor = end;
    }
  }

  // A group never runs into the next one.
  for (let index = 0; index < groups.length - 1; index += 1) {
    if (groups[index].endMs > groups[index + 1].startMs) {
      groups[index].endMs = groups[index + 1].startMs;
    }
  }
  return groups.filter((group) => group.endMs > group.startMs);
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function ffmpegColor(hex: string, opacity?: number): string {
  const base = `0x${hex.slice(1).toUpperCase()}`;
  return opacity === undefined ? base : `${base}@${opacity.toFixed(2)}`;
}

export interface CaptionBurnFilterScript {
  /** A `-filter_complex_script` body that ends in the `[vFinal]` label. */
  script: string;
  groupCount: number;
  fontSize: number;
}

/**
 * Builds the filtergraph that draws the captions into the picture: one band
 * (when the style has a backing) and one `drawtext` per line for each group,
 * each enabled only while its group is spoken.
 *
 * Returns `null` when the SRT has no usable cue.
 */
export function buildCaptionBurnFilterScript(options: {
  height: number;
  srt: string;
  style?: ICaptionBurnStyle | null;
  width: number;
}): CaptionBurnFilterScript | null {
  const style = resolveCaptionBurnStyle(options.style);
  const { height, width } = options;
  const shortSide = Math.min(width, height);
  const fontSize = Math.max(12, Math.round(shortSide * style.fontSizeRatio));
  const pitch = Math.round(fontSize * LINE_PITCH_EM);
  const padding = Math.round(fontSize * BAND_PADDING_EM);
  const textWidth = width * (1 - 2 * SIDE_MARGIN_RATIO);
  const charBudget = Math.max(
    8,
    Math.floor(
      textWidth /
        (fontSize *
          (style.textCase === 'upper'
            ? AVERAGE_UPPERCASE_GLYPH_EM
            : AVERAGE_GLYPH_EM)),
    ),
  );

  const groups = groupCaptionCues(parseSrtCues(options.srt), style, charBudget);
  if (groups.length === 0) return null;
  if (groups.length > MAX_CAPTION_GROUPS) {
    throw new Error(
      `Too many caption groups to burn in: ${groups.length} (limit ${MAX_CAPTION_GROUPS})`,
    );
  }

  const fontFile = escapeDrawtextValue(resolveFontFile(style.fontFamily));
  const outline = style.backgroundColor
    ? ''
    : `:borderw=${Math.max(2, Math.round(fontSize * 0.06))}:bordercolor=black`;
  const filters: string[] = [];

  for (const group of groups) {
    const lineCount = group.lines.length;
    const textHeight = (lineCount - 1) * pitch + fontSize;
    const bandHeight = textHeight + 2 * padding;
    const bandTop = ((): number => {
      if (style.position === 'top') return Math.round(height * 0.12);
      if (style.position === 'center') {
        return Math.round(height * 0.5 - bandHeight / 2);
      }
      return Math.round(height * style.bottomAnchorRatio - bandHeight);
    })();
    const enable = `enable='between(t,${seconds(group.startMs)},${seconds(group.endMs)})'`;

    if (style.backgroundColor) {
      filters.push(
        `drawbox=x=0:y=${bandTop}:w=iw:h=${bandHeight}:color=${ffmpegColor(style.backgroundColor, style.backgroundOpacity)}:t=fill:${enable}`,
      );
    }
    for (const [index, line] of group.lines.entries()) {
      const y = bandTop + padding + index * pitch;
      filters.push(
        `drawtext=fontfile='${fontFile}':text='${escapeDrawtextValue(line.replace(/'/g, '\u2019'))}':expansion=none:fontcolor=${ffmpegColor(style.fontColor)}:fontsize=${fontSize}:x=(w-text_w)/2:y=${y}${outline}:${enable}`,
      );
    }
  }

  return {
    fontSize,
    groupCount: groups.length,
    script: `[0:v]${filters.join(',')}[vFinal]`,
  };
}
