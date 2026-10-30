import { resolveFontFile } from '@files/helpers/utils/font/font-file.util';
import { escapeDrawtextValue } from '@files/helpers/utils/string/string.util';
import { measureTextWidth } from '@files/services/files/captions/font-metrics.util';
import type {
  CaptionBurnPosition,
  ICaptionBurnStyle,
} from '@genfeedai/contracts/interfaces';

export interface CaptionCue {
  endMs: number;
  startMs: number;
  text: string;
}

export interface ResolvedCaptionBurnStyle {
  activeWordColor: string | null;
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
  activeWordColor: null,
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

/** Every filter is evaluated per frame; this keeps one encode tractable. */
export const MAX_CAPTION_FILTERS = 12_000;

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
    activeWordColor:
      typeof input.activeWordColor === 'string' &&
      HEX_COLOR.test(input.activeWordColor)
        ? input.activeWordColor
        : defaults.activeWordColor,
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

function wrapWords(
  words: string[],
  lineFits: (text: string) => boolean,
): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && !lineFits(candidate)) {
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
 * Splits cues into short groups that fit `maxLines` lines, where `lineFits`
 * says whether a line of text fits the caption width. A cue longer than that
 * is divided by words; time is shared by character count so each group follows
 * the speech.
 */
export function groupCaptionCues(
  cues: CaptionCue[],
  style: ResolvedCaptionBurnStyle,
  lineFits: (text: string) => boolean,
): CaptionGroup[] {
  const groups: CaptionGroup[] = [];

  const place = (words: string[], startMs: number, endMs: number): void => {
    const lines = wrapWords(words, lineFits);
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

interface ActiveWordLineOptions {
  activeColor: string;
  baseColor: string;
  enable: { endMs: number; startMs: number };
  fontFile: string;
  fontPath: string;
  fontSize: number;
  /** Letters spoken on the lines above this one, and in the whole group. */
  charsBefore: number;
  groupChars: number;
  line: string;
  outline: string;
  videoWidth: number;
  y: number;
}

/**
 * Draws one centered line word by word. Every word has a base-color copy that
 * is shown except while it is spoken, and an active-color copy shown only
 * then. A word is spoken for a share of the group's time proportional to its
 * length; with word-level cues the groups are single words and this is exact.
 */
function buildActiveWordLine(options: ActiveWordLineOptions): string[] {
  const { enable, fontPath, fontSize, line } = options;
  const words = line.split(' ').filter(Boolean);
  const groupLength = options.groupChars || 1;
  const duration = enable.endMs - enable.startMs;
  const widthOf = (text: string): number =>
    measureTextWidth(fontPath, text, fontSize) ??
    text.length * fontSize * AVERAGE_GLYPH_EM;
  const spaceWidth = widthOf(' ');
  const wordWidths = words.map(widthOf);
  const lineWidth =
    wordWidths.reduce((sum, value) => sum + value, 0) +
    spaceWidth * Math.max(0, words.length - 1);

  // Lines of one group follow each other in time.
  let spokenChars = options.charsBefore;
  let x = (options.videoWidth - lineWidth) / 2;
  const filters: string[] = [];

  for (const [index, word] of words.entries()) {
    const startMs = enable.startMs + (duration * spokenChars) / groupLength;
    spokenChars += word.length;
    const endMs = enable.startMs + (duration * spokenChars) / groupLength;
    const text = escapeDrawtextValue(word.replace(/'/g, '\u2019'));
    const position = `x=${Math.round(x)}:y=${options.y}`;
    const common = `fontfile='${options.fontFile}':text='${text}':expansion=none:fontsize=${fontSize}:${position}${options.outline}`;
    const spoken = `gte(t,${seconds(startMs)})*lt(t,${seconds(endMs)})`;
    const shown = `gte(t,${seconds(enable.startMs)})*lt(t,${seconds(enable.endMs)})`;
    filters.push(
      `drawtext=${common}:fontcolor=${ffmpegColor(options.baseColor)}:enable='${shown}*(1-${spoken})'`,
      `drawtext=${common}:fontcolor=${ffmpegColor(options.activeColor)}:enable='${spoken}'`,
    );
    x += wordWidths[index] + spaceWidth;
  }
  return filters;
}

function charCount(lines: string[]): number {
  return lines.join('').replace(/ /g, '').length;
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
  const fontPath = resolveFontFile(style.fontFamily);
  const averageGlyphEm =
    style.textCase === 'upper' ? AVERAGE_UPPERCASE_GLYPH_EM : AVERAGE_GLYPH_EM;
  const lineFits = (text: string): boolean =>
    (measureTextWidth(fontPath, text, fontSize) ??
      text.length * fontSize * averageGlyphEm) <= textWidth;

  const groups = groupCaptionCues(parseSrtCues(options.srt), style, lineFits);
  if (groups.length === 0) return null;
  if (groups.length > MAX_CAPTION_GROUPS) {
    throw new Error(
      `Too many caption groups to burn in: ${groups.length} (limit ${MAX_CAPTION_GROUPS})`,
    );
  }

  const fontFile = escapeDrawtextValue(fontPath);
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
      if (style.activeWordColor) {
        filters.push(
          ...buildActiveWordLine({
            activeColor: style.activeWordColor,
            baseColor: style.fontColor,
            enable: { endMs: group.endMs, startMs: group.startMs },
            fontFile,
            fontPath,
            fontSize,
            charsBefore: charCount(group.lines.slice(0, index)),
            groupChars: charCount(group.lines),
            line,
            outline,
            videoWidth: width,
            y,
          }),
        );
        continue;
      }
      filters.push(
        `drawtext=fontfile='${fontFile}':text='${escapeDrawtextValue(line.replace(/'/g, '\u2019'))}':expansion=none:fontcolor=${ffmpegColor(style.fontColor)}:fontsize=${fontSize}:x=(w-text_w)/2:y=${y}${outline}:${enable}`,
      );
    }
  }

  if (filters.length > MAX_CAPTION_FILTERS) {
    throw new Error(
      `Too many caption filters to burn in: ${filters.length} (limit ${MAX_CAPTION_FILTERS})`,
    );
  }

  return {
    fontSize,
    groupCount: groups.length,
    script: `[0:v]${filters.join(',')}[vFinal]`,
  };
}
