'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { MediaCanvasShellProps } from '@genfeedai/props/layout/media-canvas-shell.props';
import AmbientColorWash from '@ui/ambient/AmbientColorWash';

/**
 * Full-bleed media canvas with a floating glass toolbar and an optional
 * content-derived ambient wash — the moodboard composition generalised for any
 * media-heavy surface (generate results, library detail, mood board).
 *
 * The canvas recedes so generated content carries the colour: chrome stays
 * grayscale, the wash tints only the backdrop (DESIGN.md → "Color Entry").
 */
export default function MediaCanvasShell({
  children,
  title,
  meta,
  startSlot,
  actions,
  ambientColor,
  ambientIntensity,
  hasTexture = true,
  toolbarClassName,
  className,
}: MediaCanvasShellProps): React.JSX.Element {
  const hasToolbar = Boolean(startSlot ?? title ?? actions);

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden',
        hasTexture && 'gen-grain gen-vignette',
        className,
      )}
    >
      <AmbientColorWash color={ambientColor} intensity={ambientIntensity} />

      <div className="relative z-[1] h-full w-full">{children}</div>

      {hasToolbar && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-4',
            toolbarClassName,
          )}
        >
          <div className="pointer-events-auto flex items-center gap-2">
            {startSlot ??
              (title && (
                <div className="gen-glass flex items-center gap-2 rounded-full px-3 py-1.5">
                  <span className="text-sm font-medium text-foreground/90">
                    {title}
                  </span>
                  {meta && (
                    <span className="text-xs text-foreground/55">{meta}</span>
                  )}
                </div>
              ))}
          </div>
          {actions && (
            <div className="pointer-events-auto flex items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
