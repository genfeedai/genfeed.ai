'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { DropdownMenuItem } from '@ui/primitives/dropdown-menu';
import { parseAspectRatio } from '@/features/studio/components/dropdowns/generation-setup/GenerationSetupAspectRatioIcon';
import type { GenerationSetupRatioGridProps } from '@/features/studio/props/generation-setup.props';

const FRAME_LONG_EDGE = 28;

/**
 * Aspect ratio as a grid of tiles: each draws a frame in the ratio's own
 * shape (dashed for Auto) above its label, so the choice reads at a glance
 * instead of as a list of numbers. The current tile is filled and outlined.
 */
export default function GenerationSetupRatioGrid({
  label,
  note,
  onValueChange,
  options,
  value,
}: GenerationSetupRatioGridProps) {
  return (
    <div className="flex flex-col">
      <div
        aria-label={label}
        className="grid grid-cols-3 gap-1.5 p-2"
        role="group"
      >
        {options.map((option) => {
          const parsed = parseAspectRatio(option.ratio);
          const scale = parsed
            ? FRAME_LONG_EDGE / Math.max(parsed.width, parsed.height)
            : 1;
          const isSelected = option.value === value;

          return (
            <DropdownMenuItem
              key={option.value}
              aria-checked={isSelected}
              className={cn(
                'flex h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-md border p-1 text-xs',
                isSelected
                  ? 'border-primary/60 bg-accent text-accent-foreground'
                  : 'border-transparent text-muted-foreground',
              )}
              onSelect={() => onValueChange(option.value)}
              role="menuitemradio"
            >
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center"
              >
                <span
                  className={cn(
                    'rounded-[3px] border-[1.5px] border-current',
                    !parsed && 'border-dashed',
                  )}
                  style={{
                    height: parsed
                      ? Math.round(parsed.height * scale)
                      : FRAME_LONG_EDGE,
                    width: parsed
                      ? Math.round(parsed.width * scale)
                      : FRAME_LONG_EDGE,
                  }}
                />
              </span>
              <span className="tabular-nums">{option.label}</span>
            </DropdownMenuItem>
          );
        })}
      </div>
      {note ? (
        <p
          className="border-t border-border px-3 py-2 text-xs text-muted-foreground"
          role="note"
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
