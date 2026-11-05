import type { RowSidebarTrendProps } from '@genfeedai/props/ui/display/row-sidebar-blocks.props';
import { ChartGhost } from '@ui/primitives/chart-empty-state';
import { Skeleton } from '@ui/primitives/skeleton';

const WIDTH = 100;
const HEIGHT = 32;
const PADDING = 2;

function toCoordinates(points: number[]): string[] {
  const max = Math.max(...points, 1);
  const step = WIDTH / (points.length - 1);

  return points.map((value, index) => {
    const x = (index * step).toFixed(2);
    const y = (
      HEIGHT -
      PADDING -
      (Math.max(value, 0) / max) * (HEIGHT - PADDING * 2)
    ).toFixed(2);
    return `${x},${y}`;
  });
}

/** Area sparkline of one value per period for a row's right sidebar. */
export default function RowSidebarTrend({
  emptyLabel,
  isLoading = false,
  label,
  points,
}: RowSidebarTrendProps) {
  if (isLoading) {
    return <Skeleton className="h-16 w-full" aria-busy="true" />;
  }

  if (points.length < 2 || points.every((value) => value <= 0)) {
    return (
      <div className="relative h-16 w-full">
        <ChartGhost
          className="absolute inset-0 size-full opacity-60"
          shape="area"
        />
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      </div>
    );
  }

  const coordinates = toCoordinates(points);
  const line = coordinates.join(' ');

  return (
    <svg
      aria-label={label}
      className="h-16 w-full overflow-visible text-foreground"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      <polygon
        className="fill-current opacity-10"
        points={`0,${HEIGHT} ${line} ${WIDTH},${HEIGHT}`}
      />
      <polyline
        className="fill-none stroke-current"
        points={line}
        strokeLinejoin="round"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
