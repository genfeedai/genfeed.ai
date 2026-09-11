'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Bell, Check, CircleAlert, CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ActivityFeedContent } from '@/components/shell/ActivityFeed';
import { useLiveActivityFeed } from '@/components/shell/use-live-activity-feed';
import { useNotificationInbox } from '@/components/shell/use-notification-inbox';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';

export default function NotificationInboxMenu() {
  const translate = useTranslations('common.notificationInbox');
  const translateActivity = useTranslations('common.activity');
  const [open, setOpen] = useState(false);
  const activity = useLiveActivityFeed();
  const [activeTab, setActiveTab] = useState('notifications');
  const { count, history, read, organizationId } = useNotificationInbox(open);
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount = count.data?.unreadCount;
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen)
          setActiveTab(activity.activeCount ? 'activity' : 'notifications');
      }}
    >
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
          {activity.activeCount > 0 ? (
            <span
              role="status"
              className="absolute -bottom-1 -right-1 rounded-full bg-muted px-1 text-[10px] tabular-nums text-foreground"
              aria-label={translateActivity('activeCount', {
                count: activity.activeCount,
              })}
            >
              {activity.activeCount}
            </span>
          ) : null}
          {unreadCount ? (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 rounded-full bg-info px-1 text-[10px] text-info-foreground"
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
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="sr-only">{translate('title')}</h2>
          {activeTab === 'notifications' ? (
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              withWrapper={false}
              className="shrink-0"
              disabled={read.isPending || !unreadCount}
              onClick={() => read.mutate(null)}
            >
              {translate('readAll')}
            </Button>
          ) : null}
          <Tabs
            ariaLabel={translate('tabsLabel')}
            fullWidth={false}
            className="mb-0 ml-auto"
            activeTab={activeTab}
            onTabChange={setActiveTab}
            items={[
              { id: 'notifications', label: translate('title') },
              {
                id: 'activity',
                label: activity.activeCount
                  ? translateActivity('activeTab', {
                      count: activity.activeCount,
                    })
                  : translateActivity('label'),
              },
            ]}
          />
        </div>
        {activeTab === 'activity' ? (
          <ActivityFeedContent
            {...activity}
            onNavigate={() => setOpen(false)}
          />
        ) : (
          <div
            className="max-h-[min(28rem,65vh)] overflow-y-auto text-xs"
            aria-busy={history.isFetching || read.isPending}
          >
            {count.isError ? (
              <div role="alert" className="p-3">
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
              <div role="alert" className="p-3">
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
              <p className="p-3" role="status">
                {translate('loading')}
              </p>
            ) : null}
            {history.isError ? (
              <div role="alert" className="p-3">
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
              <p className="p-3">{translate('empty')}</p>
            ) : null}
            <ol className="divide-y divide-border">
              {items.map((item) => {
                const title =
                  item.failure?.title ??
                  translate(
                    item.outcome === 'completed' ? 'completed' : 'failed',
                  );
                const sourceCopy =
                  item.sourceLabel ??
                  (item.sourceHref
                    ? translate('openSource')
                    : translate('unavailable'));
                const body = (
                  <>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      {item.outcome === 'completed' ? (
                        <CircleCheck
                          aria-hidden="true"
                          className="size-4 text-success"
                        />
                      ) : (
                        <CircleAlert
                          aria-hidden="true"
                          className="size-4 text-destructive"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block min-w-0 text-xs font-medium leading-5 text-foreground">
                        {title}
                      </span>
                      {item.failure ? (
                        <span className="block space-y-1 text-xs text-muted-foreground">
                          <span className="block">{item.failure.summary}</span>
                          {item.failure.recovery ? (
                            <span className="block">
                              {item.failure.recovery}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      <span className="block truncate text-xs text-muted-foreground underline-offset-2 group-hover:text-foreground group-hover:underline">
                        {sourceCopy}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={item.id} className="px-2 py-1">
                    <div
                      data-testid="notification-inbox-row"
                      className="flex items-start gap-1 rounded-md px-1 py-1.5 hover:bg-hover"
                    >
                      {item.sourceHref ? (
                        <Link
                          href={item.sourceHref}
                          onClick={() => setOpen(false)}
                          className="group flex min-w-0 flex-1 items-start gap-2.5"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-start gap-2.5">
                          {body}
                        </div>
                      )}
                      <div className="flex shrink-0 items-center gap-1">
                        <ClientFormattedDate
                          value={item.occurredAt}
                          format="relative"
                          fallback=""
                          className="shrink-0 text-xs text-muted-foreground"
                        />
                        {!item.readAt ? (
                          <>
                            <span className="size-1.5 rounded-full bg-info">
                              <span className="sr-only">
                                {translate('unread')}
                              </span>
                            </span>
                            <Button
                              variant={ButtonVariant.GHOST}
                              size={ButtonSize.ICON}
                              className="size-6"
                              ariaLabel={translate('markRead')}
                              disabled={read.isPending}
                              onClick={() => read.mutate([item.id])}
                            >
                              <Check aria-hidden="true" className="size-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {history.hasNextPage ? (
              <Button
                variant={ButtonVariant.GHOST}
                withWrapper={false}
                className="w-full justify-center rounded-none border-t border-border"
                disabled={history.isFetching}
                onClick={() => void history.fetchNextPage()}
              >
                {translate('loadMore')}
              </Button>
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
