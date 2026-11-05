export type Rgba = [number, number, number, number];

/** Reads a computed `rgb()` / `rgba()` colour; null when it is any other form. */
export function parseRgba(value: string): Rgba | null {
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

/** WCAG relative luminance: 0 is black, 1 is white. */
export function relativeLuminance([red, green, blue]: Rgba): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
