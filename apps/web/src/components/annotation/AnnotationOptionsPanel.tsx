'use client';

import { clsx } from 'clsx';
import type { AnnotationTool, ToolOptions } from '@genfeedai/workflow-ui/stores';
import { COLORS, FONT_SIZES, STROKE_WIDTHS } from './drawing/constants';

interface AnnotationOptionsPanelProps {
  currentTool: AnnotationTool;
  toolOptions: ToolOptions;
  onOptionsChange: (options: Partial<ToolOptions>) => void;
}

/**
 * Options panel for annotation tools (colors, stroke width, fill, font size)
 */
export function AnnotationOptionsPanel({
  currentTool,
  toolOptions,
  onOptionsChange,
}: AnnotationOptionsPanelProps) {
  return (
    <div className="flex w-48 flex-col gap-4 border-l border-border bg-card p-4">
      {/* Colors */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Color</label>
        <div className="grid grid-cols-5 gap-1.5">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onOptionsChange({ strokeColor: color })}
              className={clsx(
                'h-7 w-7 rounded-md border-2 transition',
                toolOptions.strokeColor === color ? 'border-primary' : 'border-transparent'
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Stroke Width */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Stroke Width</label>
        <div className="flex gap-2">
          {STROKE_WIDTHS.map((width) => (
            <button
              key={width}
              onClick={() => onOptionsChange({ strokeWidth: width })}
              className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-md border transition',
                toolOptions.strokeWidth === width
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-muted-foreground'
              )}
            >
              <div
                className="rounded-full bg-foreground"
                style={{ height: width * 2, width: width * 2 }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Fill Toggle */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Fill</label>
        <button
          onClick={() =>
            onOptionsChange({
              fillColor: toolOptions.fillColor ? null : `${toolOptions.strokeColor}40`,
            })
          }
          className={clsx(
            'w-full rounded-md border px-3 py-2 text-sm transition',
            toolOptions.fillColor
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:border-muted-foreground'
          )}
        >
          {toolOptions.fillColor ? 'Filled' : 'No Fill'}
        </button>
      </div>

      {/* Font Size (for text tool) */}
      {currentTool === 'text' && (
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">Font Size</label>
          <select
            value={toolOptions.fontSize}
            onChange={(e) => onOptionsChange({ fontSize: parseInt(e.target.value, 10) })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
