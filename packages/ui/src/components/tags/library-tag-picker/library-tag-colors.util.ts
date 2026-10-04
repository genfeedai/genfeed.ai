/** WCAG AA contrast for normal text. */
const MIN_CONTRAST = 4.5;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export interface LibraryTagColors {
  backgroundColor: string;
  textColor: string;
}

function toRgb(hex: string): [number, number, number] {
  const digits =
    hex.length === 4
      ? hex
          .slice(1)
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : hex.slice(1);

  return [
    Number.parseInt(digits.slice(0, 2), 16),
    Number.parseInt(digits.slice(2, 4), 16),
    Number.parseInt(digits.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = toRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((left, right) => right - left);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Colors a tag chip may render with. A member can choose any color for a tag,
 * so the text color is kept only while it reads against the background;
 * otherwise black or white, whichever contrasts more, takes its place. Returns
 * `null` when the background is not a hex color, so the chip falls back to the
 * neutral theme surface.
 */
export function resolveLibraryTagColors(tag: {
  backgroundColor?: string | null;
  textColor?: string | null;
}): LibraryTagColors | null {
  const backgroundColor = tag.backgroundColor?.trim();

  if (!backgroundColor || !HEX_COLOR.test(backgroundColor)) {
    return null;
  }

  const textColor = tag.textColor?.trim();

  if (
    textColor &&
    HEX_COLOR.test(textColor) &&
    contrastRatio(backgroundColor, textColor) >= MIN_CONTRAST
  ) {
    return { backgroundColor, textColor };
  }

  return {
    backgroundColor,
    textColor:
      contrastRatio(backgroundColor, '#000000') >=
      contrastRatio(backgroundColor, '#ffffff')
        ? '#000000'
        : '#ffffff',
  };
}
