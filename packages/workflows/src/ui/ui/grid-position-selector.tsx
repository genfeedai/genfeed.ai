'use client';

import { Toggle } from '@genfeedai/ui/primitives/toggle';
import { memo, useCallback } from 'react';
import { cn } from './utils';

interface GridPosition {
  x: number;
  y: number;
}

interface GridPositionSelectorProps {
  position: GridPosition;
  onPositionChange: (position: GridPosition) => void;
  className?: string;
}

const GRID_POSITIONS: GridPosition[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 1, y: 0.5 },
  { x: 0, y: 1 },
  { x: 0.5, y: 1 },
  { x: 1, y: 1 },
];

const X_LABELS: Record<number, string> = {
  0: 'left',
  0.5: 'center',
  1: 'right',
};
const Y_LABELS: Record<number, string> = {
  0: 'top',
  0.5: 'middle',
  1: 'bottom',
};

function getPositionTitle(pos: GridPosition): string {
  return `Position: ${X_LABELS[pos.x] ?? 'center'}, ${Y_LABELS[pos.y] ?? 'middle'}`;
}

function GridPositionSelectorComponent({
  position,
  onPositionChange,
  className,
}: GridPositionSelectorProps) {
  const isSelected = useCallback(
    (pos: GridPosition) =>
      Math.abs(pos.x - position.x) < 0.01 &&
      Math.abs(pos.y - position.y) < 0.01,
    [position],
  );

  return (
    <div className={cn('space-y-1.5', className)}>
      <fieldset className="space-y-1.5">
        <legend className="text-xs text-muted-foreground">
          Content Position
        </legend>
        <div className="grid grid-cols-3 gap-1 p-2 bg-background border border-input">
          {GRID_POSITIONS.map((pos) => (
            <Toggle
              aria-label={getPositionTitle(pos)}
              key={`${pos.x}-${pos.y}`}
              onPressedChange={() => onPositionChange(pos)}
              pressed={isSelected(pos)}
              size="sm"
              title={getPositionTitle(pos)}
              variant="outline"
              className="size-5 min-w-0 p-0"
            />
          ))}
        </div>
      </fieldset>
      <span className="text-2xs text-muted-foreground">
        Where original content appears in the new frame
      </span>
    </div>
  );
}

export const GridPositionSelector = memo(GridPositionSelectorComponent);
