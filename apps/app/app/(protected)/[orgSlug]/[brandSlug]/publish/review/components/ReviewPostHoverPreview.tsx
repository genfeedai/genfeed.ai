'use client';

import type { ChannelMediaKind } from '@api-types/contracts';
import { ButtonVariant, ContentFormat } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';

import { getReviewItemTitle } from './review-item.helpers';

interface ReviewPostHoverPreviewProps {
  children: ReactNode;
  className?: string;
  item: IBatchItem;
  /** Table rows ignore nested button clicks — open detail from here. */
  onOpenDetail?: () => void;
}

function resolveMediaKind(item: IBatchItem): ChannelMediaKind {
  const format = String(item.format ?? '').toLowerCase();
  if (format === ContentFormat.REEL || format.includes('reel')) {
    return 'short_video';
  }
  if (format === ContentFormat.VIDEO || format.includes('video')) {
    return 'video';
  }
  if (format === ContentFormat.CAROUSEL || format.includes('carousel')) {
    return 'carousel';
  }
  return 'image';
}

export default function ReviewPostHoverPreview({
  children,
  className,
  item,
  onOpenDetail,
}: ReviewPostHoverPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const title = getReviewItemTitle(item);
  const caption = item.caption?.trim() || item.prompt?.trim() || title;
  const platform = item.platform || 'twitter';
  const mediaKind = resolveMediaKind(item);

  function clearTimers() {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleOpen() {
    clearTimers();
    openTimerRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 350);
  }

  function scheduleClose() {
    clearTimers();
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 120);
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          ariaLabel="Preview post"
          className={cn(
            'inline-flex h-auto min-w-0 max-w-full justify-start p-0 text-left font-normal',
            className,
          )}
          onBlur={scheduleClose}
          onClick={() => {
            onOpenDetail?.();
          }}
          onFocus={scheduleOpen}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {children}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] border border-border bg-popover p-2 text-popover-foreground shadow-dropdown"
        onMouseEnter={() => {
          clearTimers();
          setIsOpen(true);
        }}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        side="right"
        sideOffset={10}
      >
        <PlatformPreview
          className="max-h-[28rem] overflow-y-auto"
          emptyMessage="No preview available for this draft."
          target={{
            caption,
            media: item.mediaUrl
              ? [
                  {
                    id: `${item.id}-media`,
                    kind: mediaKind,
                    thumbnailUrl: item.mediaUrl,
                    url: item.mediaUrl,
                  },
                ]
              : [],
            platform,
            title,
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
