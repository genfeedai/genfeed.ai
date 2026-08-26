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
import { Megaphone } from 'lucide-react';
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
};

export function AdGridCard({
  isSelected,
  item,
  metric,
  onSelect,
}: AdGridCardProps) {
  const metricValue = getMetricValue(item, metric);
  const longevityLabel = formatLongevity(item.longevity);
  const previewUrl = item.previewUrl || item.imageUrls?.[0];

  return (
    <Button
      type="button"
      aria-pressed={isSelected}
      ariaLabel={`${isSelected ? 'Selected' : 'Select'} ${item.title} for research context`}
      variant={ButtonVariant.UNSTYLED}
      onClick={() => onSelect(item)}
      className={cn(
        'group rounded-card border border-border bg-card p-4 text-left transition-[border-color,box-shadow] duration-200 hover:border-border-strong',
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
        {item.headline || item.body || item.explanation || 'No copy available.'}
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
  );
}

type AdTableRowProps = {
  isSelected: boolean;
  item: AdsResearchItem;
  metric: AdsResearchMetric;
  onSelect: (item: AdsResearchItem) => void;
};

export function AdTableRow({
  isSelected,
  item,
  metric,
  onSelect,
}: AdTableRowProps) {
  const metricValue = getMetricValue(item, metric);

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
    </TableRow>
  );
}

type AdsResearchAdListProps = {
  ads: AdsResearchItem[];
  isLoading: boolean;
  metric: AdsResearchMetric;
  search: string;
  selectedKey: string;
  onSelect: (item: AdsResearchItem) => void;
};

export function AdsResearchAdGrid({
  ads,
  isLoading,
  metric,
  search,
  selectedKey,
  onSelect,
}: AdsResearchAdListProps) {
  if (ads.length === 0 && !isLoading) {
    return (
      <div className="py-8 text-center text-sm text-foreground/40">
        {search.trim()
          ? 'No ads match your search.'
          : 'No ads match the current filters. Adjust filters or widen the timeframe.'}
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
          />
        );
      })}
    </div>
  );
}

type AdsResearchAdTableProps = {
  ads: AdsResearchItem[];
  metric: AdsResearchMetric;
  search: string;
  selectedKey: string;
  onSelect: (item: AdsResearchItem) => void;
};

export function AdsResearchAdTable({
  ads,
  metric,
  search,
  selectedKey,
  onSelect,
}: AdsResearchAdTableProps) {
  const translate = useTranslations('pages.adsResearch.adList');

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
          </TableRow>
        </TableHeader>
        <TableBody>
          {ads.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="px-4 py-8 text-center text-sm text-foreground/40"
              >
                {search.trim()
                  ? 'No ads match your search.'
                  : 'No ads match the current filters.'}
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
                />
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
