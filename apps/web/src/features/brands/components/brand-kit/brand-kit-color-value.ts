const HEX_COLOR_6 = /^#[\da-f]{6}$/iu;
const HEX_COLOR_3 = /^#[\da-f]{3}$/iu;

export function isBrandKitHexColor(value: string): boolean {
  const trimmed = value.trim();
  return HEX_COLOR_6.test(trimmed) || HEX_COLOR_3.test(trimmed);
}

export function toColorPickerValue(value: string): string {
  const trimmed = value.trim();
  if (HEX_COLOR_6.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (HEX_COLOR_3.test(trimmed)) {
    const [, red, green, blue] = trimmed;
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
  }
  return '#000000';
}

function relativeLuminance(hex: string): number {
  const value = toColorPickerValue(hex).slice(1);
  const [red, green, blue] = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The first brand colour that reads on `background` (WCAG AA for body text),
 * otherwise plain black or white. Keeps a brand preview legible whatever
 * palette the brand saved.
 */
export function readableTextColor(
  background: string,
  candidates: readonly (string | undefined)[],
): string {
  const readable = candidates.find(
    (candidate): candidate is string =>
      candidate !== undefined &&
      isBrandKitHexColor(candidate) &&
      contrastRatio(background, candidate) >= 4.5,
  );
  if (readable) return toColorPickerValue(readable);
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#000000')
    ? '#ffffff'
    : '#000000';
}
