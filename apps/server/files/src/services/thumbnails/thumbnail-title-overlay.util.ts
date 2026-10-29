import sharp from 'sharp';

const MAX_TITLE_CHARS = 120;
const MAX_LINES = 4;
const FONT_FAMILY = "'Liberation Sans', 'DejaVu Sans', Arial, sans-serif";

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character] ?? character,
  );
}

/** Greedy word wrap; a word longer than a line is hard-split, overflow ends in an ellipsis. */
export function wrapTitle(
  title: string,
  maxCharsPerLine: number,
  maxLines: number = MAX_LINES,
): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    let remaining = word;
    while (remaining.length > maxCharsPerLine) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(remaining.slice(0, maxCharsPerLine));
      remaining = remaining.slice(maxCharsPerLine);
    }
    const candidate = current ? `${current} ${remaining}` : remaining;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      lines.push(current);
      current = remaining;
    }
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1] ?? '';
  kept[maxLines - 1] =
    `${last.slice(0, Math.max(0, maxCharsPerLine - 1)).trimEnd()}…`;
  return kept;
}

/**
 * Lays the title over the bottom of the frame on a dark scrim so it reads on
 * any footage. Sized from the image width, so a 1080px Short cover and a
 * 1280px landscape thumbnail get proportionate type.
 */
export async function overlayTitle(
  image: Buffer,
  title: string,
): Promise<Buffer> {
  const text = title.trim().slice(0, MAX_TITLE_CHARS);
  if (!text) return image;

  const { width, height } = await sharp(image).metadata();
  if (!width || !height) return image;

  const fontSize = Math.round(Math.min(width, height * 0.6) * 0.085);
  const lineHeight = Math.round(fontSize * 1.18);
  const sidePadding = Math.round(width * 0.06);
  const maxCharsPerLine = Math.max(
    6,
    Math.floor((width - sidePadding * 2) / (fontSize * 0.56)),
  );
  const lines = wrapTitle(text, maxCharsPerLine);
  const blockHeight = lines.length * lineHeight;
  const scrimHeight = Math.min(height, blockHeight + Math.round(height * 0.16));
  const firstBaseline =
    height - Math.round(height * 0.07) - blockHeight + fontSize;

  const tspans = lines
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${firstBaseline + index * lineHeight}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="800" fill="#ffffff">${escapeXml(line)}</text>`,
    )
    .join('');

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset="0.45" stop-color="#000" stop-opacity="0.55"/>` +
      `<stop offset="1" stop-color="#000" stop-opacity="0.85"/></linearGradient></defs>` +
      `<rect x="0" y="${height - scrimHeight}" width="${width}" height="${scrimHeight}" fill="url(#scrim)"/>` +
      `${tspans}</svg>`,
  );

  return sharp(image)
    .composite([{ input: svg, left: 0, top: 0 }])
    .toBuffer();
}
