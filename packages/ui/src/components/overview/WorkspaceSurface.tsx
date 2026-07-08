import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HTMLAttributes, ReactElement, ReactNode } from 'react';

type WorkspaceSurfaceDensity = 'compact' | 'comfortable';
export type WorkspaceSurfaceTone = 'default' | 'muted' | 'elevated' | 'card';

const FRAME_TONE_CLASSES: Record<WorkspaceSurfaceTone, string> = {
  card: 'ship-ui rounded-card bg-card text-card-foreground shadow-border',
  default: 'ship-ui rounded-card bg-card text-card-foreground shadow-border',
  elevated:
    'ship-ui rounded-card bg-card text-card-foreground shadow-border-strong',
  muted: 'ship-ui rounded-card bg-card text-card-foreground shadow-border',
};

const HEADER_GAP_CLASSES: Record<WorkspaceSurfaceDensity, string> = {
  comfortable: 'mb-5 gap-3',
  compact: 'mb-4 gap-2.5',
};

const CONTENT_GAP_CLASSES: Record<WorkspaceSurfaceDensity, string> = {
  comfortable: 'gap-5 px-5 py-5 sm:px-6 sm:py-6',
  compact: 'gap-4 px-4 py-4 sm:px-5 sm:py-5',
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
          : 'ship-ui border-0 bg-transparent shadow-none',
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
          <div
            className={cn(
              'flex flex-col lg:flex-row lg:items-center lg:justify-between',
              HEADER_GAP_CLASSES[density],
            )}
          >
            <div className="space-y-1">
              {eyebrow ? (
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/35">
                  {eyebrow}
                </p>
              ) : null}
              {title ? (
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground sm:text-xl">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="text-sm leading-6 text-foreground/55">
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex flex-wrap gap-2">{actions}</div>
            ) : null}
          </div>
        ) : null}

        {children}
      </div>
    </section>
  );
}
