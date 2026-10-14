import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  StoreAppThumbnailProps,
  StoreThumbnailArt,
  StoreThumbnailSize,
  StoreThumbnailTone,
} from '@genfeedai/props/store/organization-store-page.props';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import Image from 'next/image';
import { STORE_APP_CATALOG } from './store-app-catalog';

const TONE_SURFACE_CLASSES: Record<StoreThumbnailTone, string> = {
  info: 'from-info/20 via-info/5 to-transparent',
  primary: 'from-primary/20 via-primary/5 to-transparent',
  success: 'from-success/20 via-success/5 to-transparent',
  warning: 'from-warning/20 via-warning/5 to-transparent',
};

const TONE_ICON_CLASSES: Record<StoreThumbnailTone, string> = {
  info: 'bg-info/15 text-info',
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
};

const TONE_FILL_CLASSES: Record<StoreThumbnailTone, string> = {
  info: 'bg-info/40',
  primary: 'bg-primary/40',
  success: 'bg-success/40',
  warning: 'bg-warning/40',
};

const SIZE_CLASSES: Record<StoreThumbnailSize, string> = {
  compact: 'size-10 rounded-md',
  featured: 'h-44 w-full rounded-t-card',
  standard: 'h-28 w-full rounded-t-card',
};

const ICON_SIZE_CLASSES: Record<StoreThumbnailSize, string> = {
  compact: 'size-5',
  featured: 'size-8',
  standard: 'size-6',
};

const ICON_WRAPPER_CLASSES: Record<
  Exclude<StoreThumbnailSize, 'compact'>,
  string
> = {
  featured: 'size-16 rounded-xl',
  standard: 'size-12 rounded-lg',
};

const PANEL_CLASSES = 'rounded-sm border border-border bg-card/80';

/** Two weeks of posting days for the Publishing art; two are scheduled. */
const SCHEDULE_SLOTS = ['m1', 't1', 'w1', 'f1', 'm2', 't2', 'w2', 'f2'];
const SCHEDULED_SLOTS = new Set(['t1', 'w2']);

/** Simple divs only: abstract hints of what each app makes. */
function ThumbnailArt({
  art,
  tone,
}: {
  art: StoreThumbnailArt;
  tone: StoreThumbnailTone;
}) {
  const fill = TONE_FILL_CLASSES[tone];

  switch (art) {
    case 'frames':
      return (
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((frame) => (
            <div
              key={frame}
              className={cn(PANEL_CLASSES, 'h-10 w-14 p-1')}
              style={{ opacity: 1 - frame * 0.2 }}
            >
              <div className={cn('size-full rounded-[2px]', fill)} />
            </div>
          ))}
        </div>
      );
    case 'layers':
      return (
        <div className="relative h-16 w-24">
          <div
            className={cn(PANEL_CLASSES, 'absolute left-0 top-0 h-10 w-16')}
          />
          <div
            className={cn(
              PANEL_CLASSES,
              'absolute left-4 top-3 h-10 w-16 opacity-90',
            )}
          />
          <div
            className={cn(PANEL_CLASSES, 'absolute left-8 top-6 h-10 w-16 p-1')}
          >
            <div className={cn('size-full rounded-[2px]', fill)} />
          </div>
        </div>
      );
    case 'prompt':
      return (
        <div className="flex w-28 flex-col gap-2">
          <div className={cn(PANEL_CLASSES, 'h-12 p-1.5')}>
            <div className={cn('size-full rounded-[2px]', fill)} />
          </div>
          <div className={cn(PANEL_CLASSES, 'flex h-5 items-center px-1.5')}>
            <div className="h-1 w-2/3 rounded-full bg-foreground/20" />
          </div>
        </div>
      );
    case 'motion':
      return (
        <div className="flex h-14 items-end gap-1.5">
          {[40, 75, 55, 100, 65].map((height) => (
            <div
              key={height}
              className={cn('w-3 rounded-sm', fill)}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      );
    case 'trim':
      return (
        <div className="flex w-28 flex-col gap-2">
          <div className={cn(PANEL_CLASSES, 'relative h-4 w-full')}>
            <div
              className={cn(
                'absolute inset-y-0.5 left-6 w-12 rounded-sm',
                fill,
              )}
            />
          </div>
          <div className="flex gap-1.5">
            <div className={cn(PANEL_CLASSES, 'h-8 flex-1')} />
            <div className={cn(PANEL_CLASSES, 'h-8 flex-1')} />
          </div>
        </div>
      );
    case 'timeline':
      return (
        <div className="flex w-28 flex-col gap-1.5">
          <div className="flex gap-1">
            <div className={cn('h-3 w-10 rounded-sm', fill)} />
            <div className={cn(PANEL_CLASSES, 'h-3 w-7')} />
            <div className={cn('h-3 w-6 rounded-sm', fill)} />
          </div>
          <div className="flex gap-1 pl-3">
            <div className={cn(PANEL_CLASSES, 'h-3 w-9')} />
            <div className={cn('h-3 w-12 rounded-sm', fill)} />
          </div>
          <div className="flex gap-1">
            <div className={cn('h-3 w-5 rounded-sm', fill)} />
            <div className={cn(PANEL_CLASSES, 'h-3 w-14')} />
          </div>
        </div>
      );
    case 'flow':
      return (
        <div className="flex items-center">
          <div className={cn(PANEL_CLASSES, 'size-8')} />
          <div className="h-px w-5 bg-foreground/25" />
          <div className={cn('size-8 rounded-sm', fill)} />
          <div className="h-px w-5 bg-foreground/25" />
          <div className={cn(PANEL_CLASSES, 'size-8')} />
        </div>
      );
    case 'inbox':
      return (
        <div className="flex w-28 flex-col gap-1.5">
          <div className={cn(PANEL_CLASSES, 'h-5 w-20 self-start')} />
          <div className={cn('h-5 w-16 self-end rounded-sm', fill)} />
          <div className={cn(PANEL_CLASSES, 'h-5 w-24 self-start')} />
        </div>
      );
    case 'schedule':
      return (
        <div className="grid w-28 grid-cols-4 gap-1">
          {SCHEDULE_SLOTS.map((slot) => (
            <div
              key={slot}
              className={cn(
                'h-5 rounded-sm',
                SCHEDULED_SLOTS.has(slot) ? fill : PANEL_CLASSES,
              )}
            />
          ))}
        </div>
      );
    case 'stats':
      return (
        <div className="flex w-28 flex-col gap-1.5">
          <div className="flex gap-1.5">
            <div className={cn(PANEL_CLASSES, 'h-7 flex-1 p-1')}>
              <div className={cn('h-1.5 w-2/3 rounded-full', fill)} />
            </div>
            <div className={cn(PANEL_CLASSES, 'h-7 flex-1 p-1')}>
              <div className={cn('h-1.5 w-1/2 rounded-full', fill)} />
            </div>
          </div>
          <div className={cn(PANEL_CLASSES, 'flex h-6 items-end gap-1 p-1')}>
            {[30, 55, 45, 80, 100].map((height) => (
              <div
                key={height}
                className={cn('flex-1 rounded-[1px]', fill)}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
      );
    case 'trend':
      return (
        <div className="flex h-14 items-end gap-1.5">
          {[25, 40, 35, 60, 80, 100].map((height) => (
            <div
              key={height}
              className={cn('w-3 rounded-sm', fill)}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      );
  }
}

/**
 * Designed thumbnail for a Store app or organization module. Draws a tinted tile with the app icon
 * and a small abstract illustration; once the app's catalog entry carries a
 * `thumbnailSrc`, that image replaces the tile.
 */
export default function StoreAppThumbnail({
  appId,
  icon: Icon,
  label,
  size,
}: StoreAppThumbnailProps) {
  const entry = STORE_APP_CATALOG[appId];
  const { thumbnailSrc } = entry;

  if (thumbnailSrc) {
    return (
      <div
        className={cn(
          'relative shrink-0 overflow-hidden bg-muted',
          SIZE_CLASSES[size],
        )}
        data-testid={`store-thumbnail-${appId}`}
      >
        <Image
          alt={label}
          className="object-cover object-center outline-media"
          fill
          loading="lazy"
          sizes={
            size === 'compact' ? '2.5rem' : '(min-width: 768px) 26rem, 85vw'
          }
          src={thumbnailSrc}
          unoptimized={!canOptimizeImageSource(thumbnailSrc)}
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative flex shrink-0 items-center overflow-hidden bg-gradient-to-br',
        size === 'compact'
          ? 'justify-center border border-border'
          : 'justify-between gap-4 border-b border-border px-6',
        TONE_SURFACE_CLASSES[entry.tone],
        SIZE_CLASSES[size],
      )}
      data-testid={`store-thumbnail-${appId}`}
    >
      {size === 'compact' ? (
        <Icon className={cn(ICON_SIZE_CLASSES[size], 'text-foreground/80')} />
      ) : (
        <>
          <div
            className={cn(
              'flex shrink-0 items-center justify-center',
              TONE_ICON_CLASSES[entry.tone],
              ICON_WRAPPER_CLASSES[size],
            )}
          >
            <Icon className={ICON_SIZE_CLASSES[size]} />
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end">
            <ThumbnailArt art={entry.art} tone={entry.tone} />
          </div>
        </>
      )}
    </div>
  );
}
