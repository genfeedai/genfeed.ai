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
import Image from 'next/image';
import { HiOutlineMegaphone } from 'react-icons/hi2';
import {
  formatMetric,
  getMetricLabel,
  getMetricValue,
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
          <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-card text-white/70">
            <HiOutlineMegaphone className="size-4" />
          </div>

          <div className="min-w-0">
            <h3 className="line-clamp-2 text-base font-semibold text-foreground">
              {item.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant={item.source === 'public' ? 'blue' : 'accent'}>
                {item.source === 'public' ? 'Public' : 'Connected'}
              </Badge>
              <Badge variant="ghost">
                {item.platform === 'meta' ? 'Meta' : 'Google'}
              </Badge>
              {item.channel !== 'all' && (
                <Badge variant="ghost">{item.channel}</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg shadow-border bg-card px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/45">
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
        <div className="relative mt-3 h-36 overflow-hidden rounded-lg border border-white/[0.06] bg-black/20">
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
          <span className="rounded-full border border-white/[0.06] bg-card px-2.5 py-1 text-xs text-foreground/60">
            {item.accountName}
          </span>
        )}
        {item.industry && (
          <span className="rounded-full border border-white/[0.06] bg-card px-2.5 py-1 text-xs text-foreground/60">
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
        'cursor-pointer border-b border-white/[0.06] transition-colors hover:bg-white/[0.03]',
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
        <Badge variant="ghost">
          {item.platform === 'meta' ? 'Meta' : 'Google'}
        </Badge>
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
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
      <Table className="w-full text-left">
        <TableHeader>
          <TableRow className="border-b border-white/[0.06] bg-card">
            <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
              Platform
            </TableHead>
            <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
              Title
            </TableHead>
            <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
              Source
            </TableHead>
            <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
              {getMetricLabel(metric)}
            </TableHead>
            <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
              CTR
            </TableHead>
            <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
              Channel
            </TableHead>
            <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
              Account
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ads.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
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
