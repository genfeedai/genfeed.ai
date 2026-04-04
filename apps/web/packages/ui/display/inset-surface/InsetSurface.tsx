import { cn } from '@helpers/formatting/cn/cn.util';
import type { HTMLAttributes, ReactElement } from 'react';

export type InsetSurfaceDensity = 'comfortable' | 'compact';
export type InsetSurfaceTone = 'default' | 'contrast' | 'muted';

const DENSITY_CLASSES: Record<InsetSurfaceDensity, string> = {
  comfortable: 'p-4',
  compact: 'p-3',
};

const TONE_CLASSES: Record<InsetSurfaceTone, string> = {
  contrast: 'border border-white/[0.08] bg-black/20',
  default: 'border border-white/[0.08] bg-white/[0.03]',
  muted: 'border border-border/60 bg-background',
};

export interface InsetSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  density?: InsetSurfaceDensity;
  tone?: InsetSurfaceTone;
}

export default function InsetSurface({
  children,
  className,
  density = 'comfortable',
  tone = 'default',
  ...props
}: InsetSurfaceProps): ReactElement {
  return (
    <div
      {...props}
      className={cn(
        'rounded-2xl',
        DENSITY_CLASSES[density],
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
