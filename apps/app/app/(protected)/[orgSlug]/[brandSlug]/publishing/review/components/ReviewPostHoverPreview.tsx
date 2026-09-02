'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IBatchItem } from '@genfeedai/contracts/interfaces';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import TargetPreview from '@ui/previews/TargetPreview';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { ArrowUpRight, PanelRightOpen } from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { buildReviewItemTargetPreview } from './review-item.helpers';

interface ReviewPostHoverPreviewProps {
  children: ReactNode;
  className?: string;
  item: IBatchItem;
  /** Select row / open Context rail. */
  onOpenDetail?: () => void;
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
  const { href } = useOrgUrl();
  const translate = useTranslations('pages.publishing.review.preview');

  const targetPreview = buildReviewItemTargetPreview(item);
  const postDetailHref = item.postId
    ? href(getPublishingPostHref(item.postId))
    : null;

  const clearTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

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
        className="w-[min(22rem,calc(100vw-2rem))] bg-popover p-2 text-popover-foreground"
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
        {targetPreview ? (
          <TargetPreview
            {...targetPreview}
            className="max-h-[28rem] overflow-y-auto"
          />
        ) : (
          <p className="text-xs text-muted-foreground">{translate('empty')}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
          <Button
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              setIsOpen(false);
              onOpenDetail?.();
              // Same row may already be selected with a collapsed rail —
              // force-open matches the table row action.
              window.dispatchEvent(
                new CustomEvent('workspace:force-open-review-context'),
              );
            }}
            size={ButtonSize.SM}
            type="button"
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <PanelRightOpen className="size-3.5" />
            Context
          </Button>
          {postDetailHref ? (
            <Button
              asChild
              className="h-7 gap-1 px-2 text-xs"
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
            >
              <NextLink
                href={postDetailHref}
                onClick={() => {
                  setIsOpen(false);
                }}
              >
                <ArrowUpRight className="size-3.5" />
                Open post
              </NextLink>
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
