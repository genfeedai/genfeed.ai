'use client';

import type { DimensionsValue } from '@genfeedai/types';
import { clsx } from 'clsx';
import { Link, Unlink } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

interface DimensionsGroupProps {
  value: DimensionsValue;
  onChange: (value: DimensionsValue) => void;
  disabled?: boolean;
  error?: string;
  showUnit?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
}

const UNIT_OPTIONS: DimensionsValue['unit'][] = ['px', '%', 'em', 'rem', 'vw', 'vh'];

function DimensionsGroupComponent({
  value,
  onChange,
  disabled = false,
  error,
  showUnit = false,
  minWidth = 1,
  maxWidth = 10000,
  minHeight = 1,
  maxHeight = 10000,
  className,
}: DimensionsGroupProps) {
  const [isLinked, setIsLinked] = useState(false);
  const aspectRatio = value.width / value.height;

  const handleWidthChange = useCallback(
    (newWidth: number) => {
      const clampedWidth = Math.min(maxWidth, Math.max(minWidth, newWidth));
      if (isLinked) {
        const newHeight = Math.round(clampedWidth / aspectRatio);
        onChange({
          ...value,
          height: Math.min(maxHeight, Math.max(minHeight, newHeight)),
          width: clampedWidth,
        });
      } else {
        onChange({ ...value, width: clampedWidth });
      }
    },
    [value, onChange, isLinked, aspectRatio, minWidth, maxWidth, minHeight, maxHeight]
  );

  const handleHeightChange = useCallback(
    (newHeight: number) => {
      const clampedHeight = Math.min(maxHeight, Math.max(minHeight, newHeight));
      if (isLinked) {
        const newWidth = Math.round(clampedHeight * aspectRatio);
        onChange({
          ...value,
          height: clampedHeight,
          width: Math.min(maxWidth, Math.max(minWidth, newWidth)),
        });
      } else {
        onChange({ ...value, height: clampedHeight });
      }
    },
    [value, onChange, isLinked, aspectRatio, minWidth, maxWidth, minHeight, maxHeight]
  );

  const handleUnitChange = useCallback(
    (newUnit: DimensionsValue['unit']) => {
      onChange({ ...value, unit: newUnit });
    },
    [value, onChange]
  );

  const inputClasses = clsx(
    'w-20 px-2 py-1.5 text-sm text-center',
    'bg-[var(--background)] border border-[var(--border)] rounded',
    'focus:outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)]',
    '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
    disabled && 'opacity-50 cursor-not-allowed'
  );

  return (
    <div className={clsx('space-y-2', className)}>
      <div className="flex items-center gap-2">
        {/* Width */}
        <div className="flex items-center gap-1">
          <label className="text-xs text-[var(--muted-foreground)]">W</label>
          <input
            type="number"
            value={value.width}
            onChange={(e) => handleWidthChange(Number(e.target.value))}
            min={minWidth}
            max={maxWidth}
            disabled={disabled}
            className={inputClasses}
          />
        </div>

        {/* Link Toggle */}
        <button
          type="button"
          onClick={() => setIsLinked(!isLinked)}
          disabled={disabled}
          className={clsx(
            'p-1.5 rounded transition-colors',
            isLinked
              ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
              : 'hover:bg-[var(--border)] text-[var(--muted-foreground)]',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          title={isLinked ? 'Unlink dimensions' : 'Link dimensions (maintain aspect ratio)'}
        >
          {isLinked ? <Link className="w-4 h-4" /> : <Unlink className="w-4 h-4" />}
        </button>

        {/* Height */}
        <div className="flex items-center gap-1">
          <label className="text-xs text-[var(--muted-foreground)]">H</label>
          <input
            type="number"
            value={value.height}
            onChange={(e) => handleHeightChange(Number(e.target.value))}
            min={minHeight}
            max={maxHeight}
            disabled={disabled}
            className={inputClasses}
          />
        </div>

        {/* Unit Selector */}
        {showUnit && (
          <select
            value={value.unit || 'px'}
            onChange={(e) => handleUnitChange(e.target.value as DimensionsValue['unit'])}
            disabled={disabled}
            className={clsx(
              'px-2 py-1.5 text-sm',
              'bg-[var(--background)] border border-[var(--border)] rounded',
              'focus:outline-none focus:ring-1 focus:ring-[var(--primary)]',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Aspect Ratio Display */}
      {isLinked && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Aspect ratio: {aspectRatio.toFixed(2)}:1
        </p>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export const DimensionsGroup = memo(DimensionsGroupComponent);
