import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';
import type { ReactNode } from 'react';

interface AssetHoverDetailsProps {
  actions?: ReactNode;
  className?: string;
  metadata?: string;
  typeLabel?: string;
}

/**
 * Media-first card metadata. The asset stays visually quiet at rest, while
 * pointer and keyboard focus reveal the context needed to identify or act on
 * it. Semantic surface tokens keep the treatment coherent in every theme.
 */
export default function AssetHoverDetails({
  actions,
  className,
  metadata,
  typeLabel,
}: AssetHoverDetailsProps) {
  const eyebrow = [typeLabel, metadata].filter(Boolean).join(' · ');

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-30 bg-background/90 px-3 py-2 text-foreground backdrop-blur-sm transition-opacity duration-200',
        hoverRevealClassName(),
        className,
      )}
      data-asset-hover-details
    >
      {eyebrow ? (
        <p className="truncate text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </p>
      ) : null}
      {actions ? (
        <div className="mt-2 flex items-center gap-1">{actions}</div>
      ) : null}
    </div>
  );
}
