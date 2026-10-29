import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export type NoticeBannerTone = 'destructive' | 'info' | 'warning';

interface NoticeBannerBaseProps {
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon: ReactNode;
  testId?: string;
  title: ReactNode;
  tone: NoticeBannerTone;
}

/** A dismiss button is icon-only, so `dismissLabel` is required with it. */
export type NoticeBannerProps = NoticeBannerBaseProps &
  (
    | { dismissLabel: string; onDismiss?: (() => void) | undefined }
    | { dismissLabel?: undefined; onDismiss?: undefined }
  );

const TONE_ICON_TILE_CLASSES: Record<NoticeBannerTone, string> = {
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  info: 'border-info/30 bg-info/10 text-info',
  warning: 'border-warning/30 bg-warning/10 text-warning',
};

/**
 * Neutral card strip for notices: red, amber or blue only tints the bordered
 * icon tile. Layout follows the strip's own width through container queries,
 * so actions sit on the right from 672px and wrap under the text below that.
 */
export default function NoticeBanner({
  actions,
  badge,
  className,
  description,
  dismissLabel,
  icon,
  onDismiss,
  testId,
  title,
  tone,
}: NoticeBannerProps) {
  const hasActions = Boolean(actions) || Boolean(onDismiss);

  return (
    <div className="@container w-full">
      <div
        role="alert"
        data-testid={testId}
        className={cn(
          'flex w-full flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm',
          'items-stretch @2xl:flex-row @2xl:items-center @2xl:justify-between',
          className,
        )}
      >
        <div className="flex min-w-0 items-start gap-3 @2xl:items-center">
          <div
            aria-hidden="true"
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-md border [&>svg]:size-4',
              TONE_ICON_TILE_CLASSES[tone],
            )}
          >
            {icon}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold leading-5 text-foreground">
                {title}
              </p>
              {badge}
            </div>

            {description ? (
              <p className="text-sm leading-5 text-foreground/70">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {hasActions ? (
          <div className="flex w-full shrink-0 items-center gap-2 @2xl:w-auto">
            {actions}

            {onDismiss ? (
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={onDismiss}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-strong text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                ariaLabel={dismissLabel}
                icon={<X className="size-4" />}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
