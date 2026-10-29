import { resolveFontFile } from '@files/helpers/utils/font/font-file.util';
import { readFontDisplayName } from '@files/helpers/utils/font/font-name.util';
import { FontFamily } from '@genfeedai/contracts';
import type { ICoverTitleStyle } from '@genfeedai/contracts/interfaces';
import sharp, { type OverlayOptions } from 'sharp';

const MAX_TITLE_CHARS = 120;
const MAX_LINES = 4;
/** Below this width there is no room for a readable title. */
const MIN_COVER_WIDTH = 64;
const LINE_HEIGHT_EM = 1.25;
const SHRINK_STEP = 0.85;
const MAX_SHRINKS = 6;
const DEFAULT_COLOR = '#FFFFFF';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function escapeMarkup(value: string): string {
  return value.replace(
    /[&<>]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] ?? character,
  );
}

function readColor(value: string | undefined, fallback: string): string {
  return value && HEX_COLOR.test(value) ? value : fallback;
}

interface TitleTextOptions {
  accentColor: string | undefined;
  align: 'left' | 'centre';
  color: string;
  fontFile: string;
  fontName: string | null;
  isStacked: boolean;
  maxHeight: number;
  maxWidth: number;
  startSize: number;
  words: string[];
}

/**
 * Renders the title as a transparent image with the brand's own font file.
 * Pango wraps by the real glyph widths, so wide and narrow letters both fill
 * the line. The type shrinks until it fits the allowed number of lines.
 */
async function renderTitleText(
  options: TitleTextOptions,
): Promise<{ buffer: Buffer; height: number; width: number }> {
  const lastIndex = options.words.length - 1;
  const markup = options.words
    .map((word, index) => {
      const color =
        options.accentColor && index === lastIndex
          ? options.accentColor
          : options.color;
      return `<span foreground="${color}">${escapeMarkup(word)}</span>`;
    })
    .join(options.isStacked ? '\n' : ' ');

  let size = options.startSize;
  for (let attempt = 0; ; attempt += 1) {
    const buffer = await sharp({
      text: {
        align: options.align,
        font: `${options.fontName ?? 'sans'} ${Math.round(size)}`,
        fontfile: options.fontName ? options.fontFile : undefined,
        rgba: true,
        spacing: Math.round(size * (LINE_HEIGHT_EM - 1)),
        text: markup,
        width: options.maxWidth,
        wrap: 'word-char',
      },
    })
      .png()
      .toBuffer();
    const { height = 0, width = 0 } = await sharp(buffer).metadata();
    const isTooTall = height > options.maxHeight;
    if (!isTooTall || attempt >= MAX_SHRINKS) {
      return { buffer, height, width };
    }
    size *= SHRINK_STEP;
  }
}

/**
 * Lays the title over the frame. `bottom` (the default) centres it on a dark
 * scrim so it reads on any footage; `top-left` stacks one word per line in the
 * upper left with no scrim. Sized from the image width, so a 1080px Short
 * cover and a 1280px landscape thumbnail get proportionate type, and set in
 * the brand's font when the style names one.
 */
export async function overlayTitle(
  image: Buffer,
  title: string,
  style: ICoverTitleStyle = {},
): Promise<Buffer> {
  const trimmed = title.trim().slice(0, MAX_TITLE_CHARS);
  if (!trimmed) return image;

  const { width, height } = await sharp(image).metadata();
  if (!width || !height || width < MIN_COVER_WIDTH) return image;

  const text = style.textCase === 'upper' ? trimmed.toUpperCase() : trimmed;
  const words = text.split(/\s+/).filter(Boolean);
  const fontFile = resolveFontFile(style.fontFamily, FontFamily.INTER_BOLD);
  const sidePadding = Math.round(width * 0.06);
  const isTopLeft = style.placement === 'top-left';
  const baseSize = Math.min(width, height * 0.6);
  const startSize = baseSize * (isTopLeft ? 0.2 : 0.085);
  const stackedWords = words.slice(0, MAX_LINES);
  const allowedLines = isTopLeft ? stackedWords.length : MAX_LINES;
  const titleText = await renderTitleText({
    accentColor:
      style.accentColor && HEX_COLOR.test(style.accentColor)
        ? style.accentColor
        : undefined,
    align: isTopLeft ? 'left' : 'centre',
    color: readColor(style.color, DEFAULT_COLOR),
    fontFile,
    fontName: readFontDisplayName(fontFile),
    isStacked: isTopLeft,
    maxHeight: Math.round(startSize * LINE_HEIGHT_EM * allowedLines),
    maxWidth: width - sidePadding * 2,
    startSize,
    words: isTopLeft ? stackedWords : words,
  });
  if (!titleText.width || !titleText.height) return image;

  const composites: OverlayOptions[] = [];
  if (isTopLeft) {
    composites.push({
      input: titleText.buffer,
      left: sidePadding,
      top: Math.round(height * 0.07),
    });
  } else {
    const bottomEdge = height - Math.round(height * 0.07);
    const scrimHeight = Math.min(
      height,
      titleText.height + Math.round(height * 0.16),
    );
    const scrim = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${scrimHeight}">` +
        `<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="#000" stop-opacity="0"/>` +
        `<stop offset="0.45" stop-color="#000" stop-opacity="0.55"/>` +
        `<stop offset="1" stop-color="#000" stop-opacity="0.85"/></linearGradient></defs>` +
        `<rect width="${width}" height="${scrimHeight}" fill="url(#scrim)"/></svg>`,
    );
    composites.push(
      { input: scrim, left: 0, top: height - scrimHeight },
      {
        input: titleText.buffer,
        left: Math.max(0, Math.round((width - titleText.width) / 2)),
        top: Math.max(0, bottomEdge - titleText.height),
      },
    );
  }

  return sharp(image).composite(composites).toBuffer();
}
