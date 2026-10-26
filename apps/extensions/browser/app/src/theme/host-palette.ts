/**
 * The colours of the page the extension is injected into. X has three themes
 * (Default, Dim and Lights out) that are chosen in X, not by the operating
 * system, so the Genfeed menu reads the page's own background and text colour
 * instead of guessing from the OS.
 */
export interface HostPalette {
  /** Page background, as a CSS colour. */
  background: string;
  isDark: boolean;
  /** Page text colour, as a CSS colour. */
  text: string;
}

const MIN_OPAQUE_ALPHA = 0.5;
const DARK_LUMINANCE_CEILING = 0.5;
const FALLBACK_LIGHT_TEXT = 'rgb(231, 233, 234)';
const FALLBACK_DARK_TEXT = 'rgb(15, 20, 25)';

type Rgba = [number, number, number, number];

function parseRgba(value: string): Rgba | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) {
    return null;
  }
  const [red, green, blue, alpha = 1] = match[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  const channels: Rgba = [red, green, blue, alpha];
  return channels.every(Number.isFinite) ? channels : null;
}

function relativeLuminance([red, green, blue]: Rgba): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toRgb([red, green, blue]: Rgba): string {
  return `rgb(${red}, ${green}, ${blue})`;
}

function opaqueBackground(view: Window): Rgba | null {
  for (const element of [view.document.body, view.document.documentElement]) {
    if (!element) {
      continue;
    }
    const parsed = parseRgba(view.getComputedStyle(element).backgroundColor);
    if (parsed && parsed[3] >= MIN_OPAQUE_ALPHA) {
      return parsed;
    }
  }
  return null;
}

/** The page's own colours, or null when it paints no solid background to read. */
export function readHostPalette(view: Window = window): HostPalette | null {
  const background = opaqueBackground(view);
  if (!background) {
    return null;
  }
  const isDark = relativeLuminance(background) < DARK_LUMINANCE_CEILING;
  const foreground = view.document.body
    ? parseRgba(view.getComputedStyle(view.document.body).color)
    : null;
  const hasReadableText =
    foreground !== null &&
    foreground[3] >= MIN_OPAQUE_ALPHA &&
    relativeLuminance(foreground) < DARK_LUMINANCE_CEILING !== isDark;
  return {
    background: toRgb(background),
    isDark,
    text: hasReadableText
      ? toRgb(foreground)
      : isDark
        ? FALLBACK_LIGHT_TEXT
        : FALLBACK_DARK_TEXT,
  };
}

/** Custom properties that make a Genfeed surface take the page's colours. */
export function hostPaletteProperties(
  palette: HostPalette,
): Record<string, string> {
  return {
    '--border': 'color-mix(in srgb, var(--text) 20%, var(--card))',
    '--card': palette.background,
    '--hover': 'color-mix(in srgb, var(--text) 8%, var(--card))',
    '--muted': 'color-mix(in srgb, var(--text) 58%, var(--card))',
    '--text': palette.text,
  };
}
