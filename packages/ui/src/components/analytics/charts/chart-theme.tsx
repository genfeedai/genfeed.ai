import { formatPlatformLabel } from '@genfeedai/contracts';

/*
 * Axis, grid and neutral-series colors for every recharts chart. They read the
 * gray alpha ladder, which inverts with the theme; the old `--overlay-white-*`
 * values were white in both themes and vanished on the light canvas.
 */
export const chartGridStroke = 'var(--gray-alpha-200)';
export const chartAxisStroke = 'var(--gray-alpha-400)';
export const chartAxisTick = {
  fill: 'hsl(var(--muted-foreground))',
  fontSize: 12,
} as const;

/** Neutral series steps, strongest first, for metrics without a brand hue. */
export const chartNeutralSeries = [
  'var(--gray-alpha-700)',
  'var(--gray-alpha-600)',
  'var(--gray-alpha-500)',
] as const;

const CHART_PLATFORM_COLORS: Record<string, string> = {
  facebook: 'var(--platform-facebook)',
  instagram: 'var(--platform-instagram)',
  linkedin: 'var(--platform-linkedin)',
  medium: 'hsl(var(--foreground))',
  pinterest: 'var(--platform-pinterest)',
  reddit: 'var(--platform-reddit)',
  tiktok: 'var(--platform-tiktok)',
  twitter: 'var(--platform-twitter)',
  youtube: 'hsl(var(--destructive))',
};

/** The one platform → series color map every analytics chart paints with. */
export function chartPlatformColor(platform: string): string {
  return (
    CHART_PLATFORM_COLORS[platform.toLowerCase()] ??
    'hsl(var(--muted-foreground))'
  );
}

export function chartPlatformLabel(platform: string): string {
  return formatPlatformLabel(platform) ?? platform;
}

/** Loading veil a chart lays over its plot area while data is in flight. */
export function ChartLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/50">
      <span className="size-12 animate-pulse rounded-full bg-primary/30" />
    </div>
  );
}
