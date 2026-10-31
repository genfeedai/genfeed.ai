import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { SHELL_ICON_CLASS } from '@ui/constants/shell-chrome.constant';

const BOX = 16;
const LONG_EDGE = 12;

/** `{ width, height }` of a `W:H` ratio, or null for `auto` and anything unparsable. */
export function parseAspectRatio(
  ratio: string,
): { height: number; width: number } | null {
  const [rawWidth, rawHeight] = ratio.split(':');
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { height, width };
}

/** A frame in the shape of the ratio; `auto` (or anything unparsable) is a dashed square. */
export default function GenerationSetupAspectRatioIcon({
  className,
  ratio,
}: {
  className?: string;
  ratio: string;
}) {
  const parsed = parseAspectRatio(ratio);
  const scale = parsed ? LONG_EDGE / Math.max(parsed.width, parsed.height) : 0;
  const width = parsed ? parsed.width * scale : LONG_EDGE;
  const height = parsed ? parsed.height * scale : LONG_EDGE;

  return (
    <svg
      aria-hidden="true"
      className={cn(SHELL_ICON_CLASS, className)}
      data-aspect-ratio={parsed ? ratio : 'auto'}
      fill="none"
      stroke="currentColor"
      strokeDasharray={parsed ? undefined : '2.5 2.5'}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox={`0 0 ${BOX} ${BOX}`}
    >
      <rect
        height={height}
        rx={1.5}
        width={width}
        x={(BOX - width) / 2}
        y={(BOX - height) / 2}
      />
    </svg>
  );
}
