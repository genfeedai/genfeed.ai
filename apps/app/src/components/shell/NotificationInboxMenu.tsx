'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useNotificationInbox } from '@/components/shell/use-notification-inbox';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';

export default function NotificationInboxMenu() {
  const translate = useTranslations('common.notificationInbox');
  const [open, setOpen] = useState(false);
  const { count, history, read, organizationId } = useNotificationInbox(open);
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount = count.data?.unreadCount;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          className="relative size-8"
          ariaLabel={
            unreadCount === undefined
              ? translate('open')
              : translate('openCount', { count: unreadCount })
          }
        >
          <Bell aria-hidden="true" className="size-4" />
          {unreadCount ? (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 rounded-full bg-info px-1 text-[10px] text-white"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        key={organizationId}
        align="end"
        className="w-[min(28rem,calc(100vw-2rem))] p-0"
        aria-label={translate('title')}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <h2 className="text-sm font-semibold">{translate('title')}</h2>
          <Button
            variant={ButtonVariant.GHOST}
            disabled={read.isPending || !unreadCount}
            onClick={() => read.mutate(null)}
          >
            {translate('readAll')}
          </Button>
        </div>
        <div
          className="max-h-[65vh] overflow-y-auto p-3"
          aria-busy={history.isFetching || read.isPending}
        >
          {count.isError ? (
            <div role="alert">
              <p>{translate('countError')}</p>
              <Button
                variant={ButtonVariant.GHOST}
                onClick={() => void count.refetch()}
              >
                {translate('retry')}
              </Button>
            </div>
          ) : null}
          {read.isError ? (
            <div role="alert" className="mb-3">
              <p>{translate('readError')}</p>
              <Button
                variant={ButtonVariant.GHOST}
                disabled={read.isPending}
                onClick={() => read.mutate(read.variables ?? null)}
              >
                {translate('retry')}
              </Button>
            </div>
          ) : null}
          {history.isLoading ? (
            <p role="status">{translate('loading')}</p>
          ) : null}
          {history.isError ? (
            <div role="alert">
              <p>{translate('loadError')}</p>
              <Button
                variant={ButtonVariant.GHOST}
                onClick={() =>
                  void (history.isFetchNextPageError
                    ? history.fetchNextPage()
                    : history.refetch())
                }
              >
                {translate('retry')}
              </Button>
            </div>
          ) : null}
          {!history.isLoading && !history.isError && items.length === 0 ? (
            <p>{translate('empty')}</p>
          ) : null}
          <ol className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="space-y-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-medium">
                    {item.failure?.title ??
                      translate(
                        item.outcome === 'completed' ? 'completed' : 'failed',
                      )}
                  </h3>
                  {!item.readAt ? (
                    <span className="text-xs text-info">
                      {translate('unread')}
                    </span>
                  ) : null}
                </div>
                {item.sourceLabel ? (
                  <p className="text-sm text-foreground/70">
                    {item.sourceLabel}
                  </p>
                ) : null}
                {item.failure ? (
                  <>
                    <p className="text-sm">{item.failure.summary}</p>
                    <p className="text-sm text-foreground/70">
                      {item.failure.recovery}
                    </p>
                  </>
                ) : null}
                <ClientFormattedDate
                  value={item.occurredAt}
                  format="relative"
                  fallback=""
                  className="text-xs text-foreground/60"
                />
                <div className="flex items-center justify-between gap-2">
                  {item.sourceHref ? (
                    <Link
                      href={item.sourceHref}
                      onClick={() => setOpen(false)}
                      className="text-sm text-info underline underline-offset-4"
                    >
                      {translate('openSource')}
                    </Link>
                  ) : (
                    <span className="text-xs text-foreground/60">
                      {translate('unavailable')}
                    </span>
                  )}
                  {!item.readAt ? (
                    <Button
                      variant={ButtonVariant.GHOST}
                      disabled={read.isPending}
                      onClick={() => read.mutate([item.id])}
                    >
                      {translate('markRead')}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {history.hasNextPage ? (
            <Button
              variant={ButtonVariant.GHOST}
              className="w-full"
              disabled={history.isFetching}
              onClick={() => void history.fetchNextPage()}
            >
              {translate('loadMore')}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
