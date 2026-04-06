'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type {
  AnnotationTool,
  ToolOptions,
} from '@genfeedai/workflow-ui/stores';
import Button from '@ui/buttons/base/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { clsx } from 'clsx';
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
        <label className="mb-2 block text-xs font-medium text-muted-foreground">
          Color
        </label>
        <div className="grid grid-cols-5 gap-1.5">
          {COLORS.map((color) => (
            <Button
              key={color}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => onOptionsChange({ strokeColor: color })}
              className={clsx(
                'h-7 w-7 rounded-md border-2 transition',
                toolOptions.strokeColor === color
                  ? 'border-primary'
                  : 'border-transparent',
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Stroke Width */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">
          Stroke Width
        </label>
        <div className="flex gap-2">
          {STROKE_WIDTHS.map((width) => (
            <Button
              key={width}
              variant={ButtonVariant.OUTLINE}
              withWrapper={false}
              onClick={() => onOptionsChange({ strokeWidth: width })}
              className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-md border transition',
                toolOptions.strokeWidth === width
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-muted-foreground',
              )}
            >
              <div
                className="rounded-full bg-foreground"
                style={{ height: width * 2, width: width * 2 }}
              />
            </Button>
          ))}
        </div>
      </div>

      {/* Fill Toggle */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">
          Fill
        </label>
        <Button
          variant={
            toolOptions.fillColor ? ButtonVariant.OUTLINE : ButtonVariant.GHOST
          }
          withWrapper={false}
          onClick={() =>
            onOptionsChange({
              fillColor: toolOptions.fillColor
                ? null
                : `${toolOptions.strokeColor}40`,
            })
          }
          className={clsx(
            'w-full rounded-md border px-3 py-2 text-sm transition',
            toolOptions.fillColor
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:border-muted-foreground',
          )}
        >
          {toolOptions.fillColor ? 'Filled' : 'No Fill'}
        </Button>
      </div>

      {/* Font Size (for text tool) */}
      {currentTool === 'text' && (
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">
            Font Size
          </label>
          <Select
            value={String(toolOptions.fontSize)}
            onValueChange={(value) =>
              onOptionsChange({ fontSize: parseInt(value, 10) })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}px
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
