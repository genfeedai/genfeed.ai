import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ReactNode } from 'react';

interface AssetHoverDetailsProps {
  actions?: ReactNode;
  className?: string;
  label: string;
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
  label,
  metadata,
  typeLabel,
}: AssetHoverDetailsProps) {
  const eyebrow = [typeLabel, metadata].filter(Boolean).join(' · ');

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/90 px-3 py-3 text-foreground opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100',
        className,
      )}
      data-asset-hover-details
    >
      {eyebrow ? (
        <p className="truncate text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </p>
      ) : null}
      <p className="mt-1 line-clamp-2 break-words text-sm leading-snug text-foreground">
        {label}
      </p>
      {actions ? (
        <div className="pointer-events-auto mt-2 flex items-center gap-1">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
