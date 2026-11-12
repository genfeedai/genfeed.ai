'use client';

import MetricCard from '@ui/cards/metric-card/MetricCard';
import { formatThreadTime } from '@ui/lists/thread-list/group-by-recency';
import {
  ThreadListRow,
  useLocalDayClock,
} from '@ui/lists/thread-list/ThreadList';
import Image from 'next/image';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type {
  AppRailPreviewItemsProps,
  AppRailPreviewLinkRowProps,
  AppRailPreviewSectionProps,
  AppRailPreviewStateProps,
  AppRailPreviewStatProps,
  AppRailPreviewThumbnailGridProps,
} from '@/props/ui/app-rail-preview.props';
import { RailPreviewLoading } from './RailPreviewLoading';

/** A quiet group header with an optional count, like the thread lists. */
export function RailPreviewSection({
  children,
  count,
  title,
}: AppRailPreviewSectionProps) {
  return (
    <section className="py-1">
      <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
        <span>{title}</span>
        {count ? <span className="tabular-nums">{count}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Loading, error and empty states of a preview body. The skeleton keeps the
 * preview's height steady while its data arrives.
 */
export function RailPreviewState({
  children,
  emptyLabel,
  isEmpty,
  isError,
  isLoading,
  skeletonRows = 3,
}: AppRailPreviewStateProps) {
  const translate = useTranslations('common.appRail.preview');
  if (isLoading) {
    return <RailPreviewLoading rows={skeletonRows} />;
  }
  if (isError) {
    return (
      <p className="px-2.5 py-3 text-sm text-muted-foreground" role="status">
        {translate('error')}
      </p>
    );
  }
  if (isEmpty) {
    return (
      <p className="px-2.5 py-3 text-sm text-muted-foreground">{emptyLabel}</p>
    );
  }
  return <>{children}</>;
}

/** Rows of a preview, drawn by the shared thread list row. */
export function RailPreviewItems({ items }: AppRailPreviewItemsProps) {
  const locale = useLocale();
  const now = useLocalDayClock();
  return (
    <ul>
      {items.map((item) => (
        <ThreadListRow
          data-testid={`app-rail-preview-row-${item.id}`}
          href={item.href}
          key={item.id}
          status={item.status}
          statusLabel={item.statusLabel}
          subtitle={item.subtitle}
          time={formatThreadTime(item.isoDate, locale, now)}
          title={item.title}
        />
      ))}
    </ul>
  );
}

/** A number and what it counts. */
export function RailPreviewStat({ label, value }: AppRailPreviewStatProps) {
  return (
    <MetricCard appearance="inset" label={label} size="sm" value={value} />
  );
}

/** Recent media: a square grid, each tile opening the app. */
export function RailPreviewThumbnailGrid({
  items,
}: AppRailPreviewThumbnailGridProps) {
  return (
    <ul className="grid grid-cols-4 gap-1.5 p-1">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            className="relative block aspect-square overflow-hidden rounded-md bg-foreground/5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={item.href}
          >
            <Image
              alt={item.alt}
              className="object-cover"
              fill
              sizes="64px"
              src={item.src}
              unoptimized
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A row that is not a thread: a post, a conversation, a trend, a workflow. */
export function RailPreviewLinkRow({
  href,
  leading,
  subtitle,
  title,
  trailing,
}: AppRailPreviewLinkRowProps) {
  return (
    <li>
      <Link
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
        href={href}
      >
        {leading}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-foreground">{title}</span>
          {subtitle ? (
            <span className="truncate text-xs text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </span>
        {trailing ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {trailing}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
