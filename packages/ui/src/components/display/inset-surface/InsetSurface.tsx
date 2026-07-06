import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HTMLAttributes, ReactElement } from 'react';

export type InsetSurfaceDensity = 'comfortable' | 'compact';
export type InsetSurfaceTone = 'default' | 'contrast' | 'muted';

const DENSITY_CLASSES: Record<InsetSurfaceDensity, string> = {
  comfortable: 'p-4',
  compact: 'p-3',
};

// Containment via the canonical inset hairline ring (shadow-border), not a CSS
// border — CSS border is reserved for structural dividers per DESIGN.md.
const TONE_CLASSES: Record<InsetSurfaceTone, string> = {
  contrast: 'shadow-border bg-black/20',
  default: 'shadow-border bg-white/[0.03]',
  muted: 'shadow-border bg-background',
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
