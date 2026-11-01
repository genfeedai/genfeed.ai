import { ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import Spinner from './spinner';

/**
 * Scrim laid over the nearest positioned ancestor while its content loads.
 * `surface` dims app UI and shows the message in a pill, `media` dims
 * photos and video (dark whatever the theme), `veil` lightly fades a chart.
 */
export const loadingOverlayVariants = cva(
  'absolute inset-0 z-20 flex items-center justify-center',
  {
    defaultVariants: { tone: 'surface' },
    variants: {
      tone: {
        media:
          'flex-col gap-2 bg-black/60 backdrop-blur-sm' /* design-system-allow-content-color -- media scrim */,
        surface: 'bg-background/70 backdrop-blur-sm',
        veil: 'z-10 bg-card/50',
      },
    },
  },
);

export interface LoadingOverlayProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'children'>,
    VariantProps<typeof loadingOverlayVariants> {
  /** Shown beside (`surface`) or under (`media`) the spinner. */
  message?: string;
  /** Controls under the message, such as a Stop button. */
  children?: ReactNode;
}

export default function LoadingOverlay({
  children,
  className,
  message,
  tone = 'surface',
  ...props
}: LoadingOverlayProps) {
  const label = message ?? 'Loading…';

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn(loadingOverlayVariants({ tone }), className)}
      {...props}
    >
      {tone === 'veil' ? (
        <span
          aria-hidden="true"
          className="size-12 animate-pulse rounded-full bg-primary/20 motion-reduce:animate-none"
        />
      ) : tone === 'media' ? (
        <>
          <Spinner ariaLabel={label} className="size-8 text-primary" />
          {message ? (
            <span
              className={
                'text-xs text-white/80' /* design-system-allow-content-color -- on media scrim */
              }
            >
              {message}
            </span>
          ) : null}
          {children}
        </>
      ) : (
        <span className="relative flex items-center gap-3 rounded-md bg-background/90 px-3 py-2 text-sm text-foreground shadow-dropdown">
          <Spinner
            ariaLabel={label}
            className="text-foreground/80"
            size={ComponentSize.SM}
          />
          {message ?? 'Loading…'}
          {children}
        </span>
      )}
    </div>
  );
}
