'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { AdsResearchItem, AdsResearchMetric } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { Bookmark, Megaphone } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import {
  formatLongevity,
  formatMetric,
  getMetricLabel,
  getMetricValue,
  getPlatformLabel,
} from './ads-metric.helpers';

type AdGridCardProps = {
  isSelected: boolean;
  item: AdsResearchItem;
  metric: AdsResearchMetric;
  onSelect: (item: AdsResearchItem) => void;
  onToggleSaved: (items: AdsResearchItem[]) => void;
  savedMutating: boolean;
};

export function AdGridCard({
  isSelected,
  item,
  metric,
  onSelect,
  onToggleSaved,
  savedMutating,
}: AdGridCardProps) {
  const translate = useTranslations('pages.adsResearch');
  const metricValue = getMetricValue(item, metric);
  const longevityLabel = formatLongevity(item.longevity);
  const previewUrl = item.previewUrl || item.imageUrls?.[0];
  const savedActionLabel = translate(
    item.savedAdId ? 'swipeFile.unsaveAria' : 'swipeFile.saveAria',
    { title: item.title },
  );

  return (
    <div className="relative">
      <Button
        type="button"
        aria-pressed={isSelected}
        ariaLabel={`${isSelected ? 'Selected' : 'Select'} ${item.title} for research context`}
        variant={ButtonVariant.UNSTYLED}
        onClick={() => onSelect(item)}
        className={cn(
          'group h-full w-full rounded-card border border-border bg-card p-4 text-left transition-[border-color,box-shadow] duration-200 hover:border-border-strong',
          isSelected && 'border-primary/45 shadow-lg shadow-primary/10',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-md border border-border bg-background-tertiary text-muted-foreground">
              <Megaphone className="size-4" />
            </div>

            <div className="min-w-0">
              <h3 className="line-clamp-2 text-base font-semibold text-foreground">
                {item.title}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant={item.source === 'public' ? 'blue' : 'accent'}>
                  {item.source === 'public' ? 'Public' : 'Connected'}
                </Badge>
                <Badge variant="ghost">{getPlatformLabel(item.platform)}</Badge>
                {item.channel !== 'all' && (
                  <Badge variant="ghost">{item.channel}</Badge>
                )}
                {longevityLabel && (
                  <Badge
                    variant={item.longevity?.isStillRunning ? 'blue' : 'ghost'}
                  >
                    {longevityLabel}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-md bg-background-tertiary px-3 py-2 text-right">
            <div className="text-2xs uppercase tracking-[0.18em] text-foreground/45">
              {getMetricLabel(metric)}
            </div>
            <div className="text-lg font-semibold text-foreground">
              {formatMetric(metricValue)}
            </div>
          </div>
        </div>

        <p className="mt-4 line-clamp-4 min-h-[5rem] text-sm leading-6 text-foreground/72">
          {item.headline ||
            item.body ||
            item.explanation ||
            'No copy available.'}
        </p>

        {previewUrl && (
          <div
            className={
              'relative mt-3 h-36 overflow-hidden rounded-lg border border-border bg-black/20' // design-system-allow-content-color
            }
          >
            <Image
              src={previewUrl}
              alt={item.title}
              fill
              unoptimized
              sizes="(min-width: 768px) 20rem, 100vw"
              className="object-cover"
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {item.accountName && (
            <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground/60">
              {item.accountName}
            </span>
          )}
          {item.industry && (
            <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground/60">
              {item.industry}
            </span>
          )}
        </div>
      </Button>
      <Button
        type="button"
        variant={item.savedAdId ? ButtonVariant.SECONDARY : ButtonVariant.GHOST}
        ariaLabel={savedActionLabel}
        className="absolute bottom-3 right-3 size-8 p-0"
        disabled={savedMutating || item.usagePolicy === 'disclosure_only'}
        onClick={() => onToggleSaved([item])}
        withWrapper={false}
        icon={
          <Bookmark
            className={cn('size-4', item.savedAdId && 'fill-current')}
          />
        }
        label={<span className="sr-only">{savedActionLabel}</span>}
      />
    </div>
  );
}

type AdTableRowProps = {
  isSelected: boolean;
  item: AdsResearchItem;
  metric: AdsResearchMetric;
  onSelect: (item: AdsResearchItem) => void;
  onToggleSaved: (items: AdsResearchItem[]) => void;
  savedMutating: boolean;
};

export function AdTableRow({
  isSelected,
  item,
  metric,
  onSelect,
  onToggleSaved,
  savedMutating,
}: AdTableRowProps) {
  const translate = useTranslations('pages.adsResearch');
  const metricValue = getMetricValue(item, metric);
  const savedActionLabel = translate(
    item.savedAdId ? 'swipeFile.unsaveAria' : 'swipeFile.saveAria',
    { title: item.title },
  );

  return (
    <TableRow
      aria-label={`${isSelected ? 'Selected' : 'Select'} ${item.title} for research context`}
      aria-selected={isSelected}
      className={cn(
        'cursor-pointer border-b border-border transition-colors hover:bg-hover',
        isSelected && 'bg-primary/5',
      )}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(item);
        }
      }}
      tabIndex={0}
    >
      <TableCell className="px-4 py-3">
        <Badge variant="ghost">{getPlatformLabel(item.platform)}</Badge>
      </TableCell>
      <TableCell className="max-w-[300px] px-4 py-3">
        <span className="line-clamp-1 text-sm font-medium text-foreground">
          {item.title}
        </span>
      </TableCell>
      <TableCell className="px-4 py-3">
        <Badge variant={item.source === 'public' ? 'blue' : 'accent'}>
          {item.source === 'public' ? 'Public' : 'Connected'}
        </Badge>
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-foreground/60">
        {formatMetric(metricValue)}
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-foreground/60">
        {formatMetric(item.metrics.ctr)}
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-foreground/60">
        {formatLongevity(item.longevity) || '—'}
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-foreground/60">
        {item.channel !== 'all' ? item.channel : '—'}
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-foreground/40">
        {item.accountName || '—'}
      </TableCell>
      <TableCell className="px-4 py-3">
        <Button
          type="button"
          variant={
            item.savedAdId ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
          }
          ariaLabel={savedActionLabel}
          disabled={savedMutating || item.usagePolicy === 'disclosure_only'}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSaved([item]);
          }}
          icon={
            <Bookmark
              className={cn('size-4', item.savedAdId && 'fill-current')}
            />
          }
          label={<span className="sr-only">{savedActionLabel}</span>}
        />
      </TableCell>
    </TableRow>
  );
}

type AdsResearchAdListProps = {
  ads: AdsResearchItem[];
  isSavedView: boolean;
  isLoading: boolean;
  metric: AdsResearchMetric;
  search: string;
  selectedKey: string;
  onSelect: (item: AdsResearchItem) => void;
  onToggleSaved: (items: AdsResearchItem[]) => void;
  savedMutating: boolean;
};

export function AdsResearchAdGrid({
  ads,
  isSavedView,
  isLoading,
  metric,
  search,
  selectedKey,
  onSelect,
  onToggleSaved,
  savedMutating,
}: AdsResearchAdListProps) {
  const translate = useTranslations('pages.adsResearch.swipeFile');

  if (ads.length === 0 && !isLoading) {
    return (
      <div className="py-8 text-center text-sm text-foreground/40">
        {search.trim()
          ? translate('emptySearch')
          : translate(isSavedView ? 'emptyFilters' : 'emptyLiveFilters')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {ads.map((item) => {
        const key =
          item.source === 'my_accounts'
            ? `connected-${item.sourceId}`
            : `public-${item.id}`;
        const itemKey =
          item.source === 'my_accounts'
            ? `my_accounts:${item.platform}:${item.sourceId}`
            : `public:${item.platform}:${item.id}`;

        return (
          <AdGridCard
            key={key}
            item={item}
            metric={metric}
            isSelected={selectedKey === itemKey}
            onSelect={onSelect}
            onToggleSaved={onToggleSaved}
            savedMutating={savedMutating}
          />
        );
      })}
    </div>
  );
}

type AdsResearchAdTableProps = {
  ads: AdsResearchItem[];
  isSavedView: boolean;
  metric: AdsResearchMetric;
  search: string;
  selectedKey: string;
  onSelect: (item: AdsResearchItem) => void;
  onToggleSaved: (items: AdsResearchItem[]) => void;
  savedMutating: boolean;
};

export function AdsResearchAdTable({
  ads,
  isSavedView,
  metric,
  search,
  selectedKey,
  onSelect,
  onToggleSaved,
  savedMutating,
}: AdsResearchAdTableProps) {
  const translate = useTranslations('pages.adsResearch.adList');
  const translateSwipeFile = useTranslations('pages.adsResearch.swipeFile');

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table className="w-full text-left">
        <TableHeader>
          <TableRow className="border-b border-border bg-card">
            <TableHead className="px-4 py-3 text-2xs uppercase tracking-[0.18em] text-foreground/45">
              {translate('platform')}
            </TableHead>
            <TableHead className="px-4 py-3 text-2xs uppercase tracking-[0.18em] text-foreground/45">
              {translate('title')}
            </TableHead>
            <TableHead className="px-4 py-3 text-2xs uppercase tracking-[0.18em] text-foreground/45">
              {translate('source')}
            </TableHead>
            <TableHead className="px-4 py-3 text-2xs uppercase tracking-[0.18em] text-foreground/45">
              {getMetricLabel(metric)}
            </TableHead>
            <TableHead className="px-4 py-3 text-2xs uppercase tracking-[0.18em] text-foreground/45">
              {translate('ctr')}
            </TableHead>
            <TableHead className="px-4 py-3 text-2xs uppercase tracking-[0.18em] text-foreground/45">
              {translate('running')}
            </TableHead>
            <TableHead className="px-4 py-3 text-2xs uppercase tracking-[0.18em] text-foreground/45">
              {translate('channel')}
            </TableHead>
            <TableHead className="px-4 py-3 text-2xs uppercase tracking-[0.18em] text-foreground/45">
              {translate('account')}
            </TableHead>
            <TableHead className="px-4 py-3 text-2xs uppercase tracking-[0.18em] text-foreground/45">
              {translate('saved')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ads.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={9}
                className="px-4 py-8 text-center text-sm text-foreground/40"
              >
                {search.trim()
                  ? translateSwipeFile('emptySearch')
                  : translateSwipeFile(
                      isSavedView ? 'emptyFilters' : 'emptyLiveFilters',
                    )}
              </TableCell>
            </TableRow>
          ) : (
            ads.map((item) => {
              const key =
                item.source === 'my_accounts'
                  ? `connected-${item.sourceId}`
                  : `public-${item.id}`;
              const itemKey =
                item.source === 'my_accounts'
                  ? `my_accounts:${item.platform}:${item.sourceId}`
                  : `public:${item.platform}:${item.id}`;

              return (
                <AdTableRow
                  key={key}
                  item={item}
                  metric={metric}
                  isSelected={selectedKey === itemKey}
                  onSelect={onSelect}
                  onToggleSaved={onToggleSaved}
                  savedMutating={savedMutating}
                />
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
