import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HTMLAttributes, ReactElement, ReactNode } from 'react';

type WorkspaceSurfaceDensity = 'compact' | 'comfortable';
type WorkspaceSurfaceTone = 'default' | 'muted' | 'elevated';

const FRAME_TONE_CLASSES: Record<WorkspaceSurfaceTone, string> = {
  default:
    'ship-ui gen-shell-panel rounded-[1.25rem] border-white/[0.06] bg-background/88 shadow-[0_28px_72px_-48px_rgba(0,0,0,0.92)]',
  elevated:
    'ship-ui gen-shell-panel rounded-[1.35rem] border-white/[0.08] bg-background/92 shadow-[0_34px_84px_-46px_rgba(0,0,0,0.96)]',
  muted:
    'ship-ui gen-shell-panel rounded-[1.25rem] border-white/[0.05] bg-background-secondary/84 shadow-[0_24px_64px_-44px_rgba(0,0,0,0.88)]',
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
          ? cn('rounded', FRAME_TONE_CLASSES[tone])
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
        {eyebrow || title || actions ? (
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
