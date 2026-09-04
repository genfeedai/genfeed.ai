import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HTMLAttributes, ReactElement, ReactNode } from 'react';

type WorkspaceSurfaceDensity = 'compact' | 'comfortable';
export type WorkspaceSurfaceTone = 'default' | 'muted' | 'elevated' | 'card';

const FRAME_TONE_CLASSES: Record<WorkspaceSurfaceTone, string> = {
  card: 'rounded-card bg-card text-card-foreground shadow-border',
  default: 'rounded-card bg-card text-card-foreground shadow-border',
  elevated: 'rounded-card bg-card text-card-foreground shadow-border-strong',
  muted: 'rounded-card bg-card text-card-foreground shadow-border',
};

const HEADER_GAP_CLASSES: Record<WorkspaceSurfaceDensity, string> = {
  comfortable: 'mb-5 gap-3',
  compact: 'mb-3 gap-2',
};

const CONTENT_GAP_CLASSES: Record<WorkspaceSurfaceDensity, string> = {
  comfortable: 'gap-5 px-5 py-5 sm:px-6 sm:py-6',
  compact: 'gap-3 px-4 py-3 sm:px-5 sm:py-4',
};

export interface WorkspaceSurfaceProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  density?: WorkspaceSurfaceDensity;
  description?: ReactNode;
  eyebrow?: ReactNode;
  framed?: boolean;
  title?: ReactNode;
  tone?: WorkspaceSurfaceTone;
}

export function WorkspaceSurface({
  actions,
  children,
  className,
  contentClassName,
  density = 'comfortable',
  description,
  eyebrow,
  framed = true,
  title,
  tone = 'default',
  ...props
}: WorkspaceSurfaceProps): ReactElement {
  return (
    <section
      {...props}
      className={cn(
        framed
          ? FRAME_TONE_CLASSES[tone]
          : 'border-0 bg-transparent shadow-none',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-full flex-col',
          framed ? CONTENT_GAP_CLASSES[density] : 'gap-4',
          contentClassName,
        )}
      >
        {eyebrow || title || description || actions ? (
          <div className={cn('flex flex-col', HEADER_GAP_CLASSES[density])}>
            {/* Title row: actions always sit on one line with the title block. */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                {eyebrow ? (
                  <p className="text-2xs font-bold uppercase tracking-[0.2em] text-foreground/35">
                    {eyebrow}
                  </p>
                ) : null}
                {title ? (
                  <h2
                    className={cn(
                      'font-semibold tracking-[-0.02em] text-foreground',
                      density === 'compact'
                        ? 'text-base sm:text-lg'
                        : 'text-lg sm:text-xl',
                    )}
                  >
                    {title}
                  </h2>
                ) : null}
              </div>
              {actions ? (
                <div className="flex shrink-0 flex-nowrap items-center gap-2">
                  {actions}
                </div>
              ) : null}
            </div>
            {description ? (
              <p className="text-sm leading-6 text-foreground/55">
                {description}
              </p>
            ) : null}
          </div>
        ) : null}

        {children}
      </div>
    </section>
  );
}
