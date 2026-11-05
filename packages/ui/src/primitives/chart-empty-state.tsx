import { ButtonVariant, CardEmptySize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import { EmptyState, type EmptyStateAction } from '@ui/primitives/empty-state';
import type { ReactElement, ReactNode } from 'react';

/** The chart a ghost previews: what the card will draw once data lands. */
export type ChartGhostShape = 'area' | 'bars' | 'donut' | 'line';

export interface ChartGhostProps {
  shape: ChartGhostShape;
  /** Layout classes only (size, position). */
  className?: string;
}

export interface ChartEmptyStateProps {
  /** The chart this card draws once it has data. */
  shape: ChartGhostShape;
  /** Why the chart is empty right now, in the user's terms. */
  title: string;
  /** One sentence on when data arrives or what to do next. */
  description?: ReactNode;
  /** The single next step. Rendered as the primary button. */
  action?: EmptyStateAction;
  /** Custom action nodes (a Link button). Takes precedence over `action`. */
  actions?: ReactNode;
  /** Layout classes only. */
  className?: string;
}

/** Relative bar heights, tallest first, so the ghost reads as a ranking. */
const GHOST_BARS = [86, 71, 58, 46, 35, 25, 16];
const GHOST_GRID_LINES = [8, 22, 36, 50];
const GHOST_AREA_PATH =
  'M0 44 C8 40 14 30 22 32 S36 42 44 34 S58 16 66 20 S82 30 90 18 L100 12';
const GHOST_LINE_PATH =
  'M0 48 C10 46 16 40 26 42 S42 34 52 36 S70 26 80 28 S94 22 100 20';
/** Donut slices as percentages of the ring. */
const GHOST_SLICES = [46, 28, 16, 10];
const DONUT_RADIUS = 36;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const DONUT_SLICE_GAP = 1.5;
const DONUT_SLICE_OPACITY = [0.9, 0.65, 0.45, 0.3];

function GhostGrid(): ReactElement {
  return (
    <g className="stroke-current" opacity={0.35}>
      {GHOST_GRID_LINES.map((y) => (
        <line
          key={y}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
          x1={0}
          x2={100}
          y1={y}
          y2={y}
        />
      ))}
    </g>
  );
}

function GhostDonut(): ReactElement {
  const offsets = GHOST_SLICES.map((_, index) =>
    GHOST_SLICES.slice(0, index).reduce((sum, value) => sum + value, 0),
  );

  return (
    <g transform="rotate(-90 50 50)">
      {GHOST_SLICES.map((percentage, index) => {
        const length = (DONUT_CIRCUMFERENCE * percentage) / 100;
        return (
          <circle
            key={percentage}
            className="stroke-current"
            cx={50}
            cy={50}
            fill="none"
            opacity={DONUT_SLICE_OPACITY[index]}
            r={DONUT_RADIUS}
            strokeDasharray={`${length - DONUT_SLICE_GAP} ${DONUT_CIRCUMFERENCE - length + DONUT_SLICE_GAP}`}
            strokeDashoffset={-(DONUT_CIRCUMFERENCE * offsets[index]) / 100}
            strokeWidth={14}
          />
        );
      })}
    </g>
  );
}

/**
 * A faded preview of the chart a card will draw. Decorative only: it is
 * hidden from assistive tech and never carries numbers.
 */
export function ChartGhost({
  shape,
  className,
}: ChartGhostProps): ReactElement {
  if (shape === 'donut') {
    return (
      <svg
        aria-hidden="true"
        className={cn('text-muted-foreground', className)}
        data-slot="chart-ghost"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 100 100"
      >
        <GhostDonut />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={cn('text-muted-foreground', className)}
      data-slot="chart-ghost"
      preserveAspectRatio="none"
      viewBox="0 0 100 60"
    >
      <GhostGrid />
      {shape === 'bars' ? (
        <g className="fill-current" opacity={0.45}>
          {GHOST_BARS.map((height, index) => (
            <rect
              key={height}
              height={(height / 100) * 52}
              rx={1}
              width={9}
              x={4 + index * 13.4}
              y={60 - (height / 100) * 52}
            />
          ))}
        </g>
      ) : null}
      {shape === 'area' ? (
        <>
          <path
            className="fill-current"
            d={`${GHOST_AREA_PATH} L100 60 L0 60 Z`}
            opacity={0.18}
          />
          <path
            className="fill-none stroke-current"
            d={GHOST_AREA_PATH}
            opacity={0.6}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
      {shape === 'line' ? (
        <>
          <path
            className="fill-none stroke-current"
            d={GHOST_AREA_PATH}
            opacity={0.6}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          <path
            className="fill-none stroke-current"
            d={GHOST_LINE_PATH}
            opacity={0.35}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
    </svg>
  );
}

/**
 * The empty state for every chart: a faded preview of the chart that will
 * appear, one line on why it is empty right now, and one next step.
 *
 * Fills its positioned parent (the chart frame), so the card keeps the size
 * it will have once data arrives.
 */
export function ChartEmptyState({
  shape,
  title,
  description,
  action,
  actions,
  className,
}: ChartEmptyStateProps): ReactElement {
  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', className)}
      data-slot="chart-empty-state"
    >
      <div
        className={cn(
          'absolute',
          shape === 'donut' ? 'inset-6' : 'inset-x-2 bottom-2 top-4',
        )}
      >
        <ChartGhost className="size-full opacity-60" shape={shape} />
      </div>
      {/* Fades the preview behind the copy so the text stays readable. */}
      <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,hsl(var(--background))_35%,transparent_80%)]">
        <div className="max-w-xs">
          <EmptyState
            action={
              action
                ? {
                    ...action,
                    variant: action.variant ?? ButtonVariant.DEFAULT,
                  }
                : undefined
            }
            actions={actions}
            description={description}
            size={CardEmptySize.SM}
            title={title}
          />
        </div>
      </div>
    </div>
  );
}
