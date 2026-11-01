'use client';

import {
  ButtonVariant,
  CardPadding,
  CardVariant,
  ComponentSize,
} from '@genfeedai/contracts';
import {
  AdsChannel,
  type AdsResearchItem,
  type AdsResearchMetric,
} from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import Card from '@ui/card/Card';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import CollectionGrid from '@ui/collection/CollectionGrid';
import Badge from '@ui/display/badge/Badge';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Table from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import { Bookmark, BookmarkCheck, Megaphone } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  formatLongevity,
  formatMetric,
  getMetricLabel,
  getMetricValue,
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
          isSelected && 'border-primary/40 shadow-lg shadow-primary/10',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-md border border-border bg-tertiary text-muted-foreground">
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
                <PlatformBadge
                  platform={item.platform}
                  size={ComponentSize.SM}
                />
                {item.channel !== AdsChannel.ALL && (
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

          <Card variant={CardVariant.INSET} padding={CardPadding.SM}>
            <div className="text-right">
              <div className="text-2xs uppercase tracking-[0.18em] text-muted-foreground">
                {getMetricLabel(metric)}
              </div>
              <div className="text-lg font-semibold text-foreground">
                {formatMetric(metricValue)}
              </div>
            </div>
          </Card>
        </div>

        <p className="mt-4 line-clamp-4 min-h-[5rem] text-sm leading-6 text-foreground/80">
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
              className="object-cover outline-media"
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {item.accountName && (
            <Badge variant="secondary">{item.accountName}</Badge>
          )}
          {item.industry && <Badge variant="secondary">{item.industry}</Badge>}
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
      <CardEmptyContent
        label={
          search.trim()
            ? translate('emptySearch')
            : translate(isSavedView ? 'emptyFilters' : 'emptyLiveFilters')
        }
      />
    );
  }

  return (
    <CollectionGrid maxColumns={3}>
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
    </CollectionGrid>
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

const getAdSelectionKey = (item: AdsResearchItem): string =>
  item.source === 'my_accounts'
    ? `my_accounts:${item.platform}:${item.sourceId}`
    : `public:${item.platform}:${item.id}`;

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
  const translateAds = useTranslations('pages.adsResearch');
  const translateSwipeFile = useTranslations('pages.adsResearch.swipeFile');

  const columns: TableColumn<AdsResearchItem>[] = [
    {
      header: translate('platform'),
      key: 'platform',
      render: (item) => (
        <PlatformBadge platform={item.platform} size={ComponentSize.SM} />
      ),
    },
    {
      className: 'max-w-[300px]',
      header: translate('title'),
      key: 'title',
      render: (item) => (
        <span className="line-clamp-1 text-sm font-medium text-foreground">
          {item.title}
        </span>
      ),
    },
    {
      header: translate('source'),
      key: 'source',
      render: (item) => (
        <Badge variant={item.source === 'public' ? 'blue' : 'accent'}>
          {item.source === 'public' ? 'Public' : 'Connected'}
        </Badge>
      ),
    },
    {
      className: 'text-sm text-foreground/60',
      header: getMetricLabel(metric),
      key: 'metric',
      render: (item) => formatMetric(getMetricValue(item, metric)),
    },
    {
      className: 'text-sm text-foreground/60',
      header: translate('ctr'),
      key: 'ctr',
      render: (item) => formatMetric(item.metrics.ctr),
    },
    {
      className: 'text-sm text-foreground/60',
      header: translate('running'),
      key: 'longevity',
      render: (item) => formatLongevity(item.longevity) || '—',
    },
    {
      className: 'text-sm text-foreground/60',
      header: translate('channel'),
      key: 'channel',
      render: (item) => (item.channel !== AdsChannel.ALL ? item.channel : '—'),
    },
    {
      className: 'text-sm text-muted-foreground',
      header: translate('account'),
      key: 'accountName',
      render: (item) => item.accountName || '—',
    },
    {
      header: translate('saved'),
      key: 'savedAdId',
      render: (item) =>
        item.savedAdId ? (
          <Badge variant="secondary">{translateAds('swipeFile.saved')}</Badge>
        ) : (
          '—'
        ),
    },
  ];

  const actions: TableAction<AdsResearchItem>[] = [
    {
      ariaLabel: (item) =>
        translateAds(
          item.savedAdId ? 'swipeFile.unsaveAria' : 'swipeFile.saveAria',
          { title: item.title },
        ),
      icon: (item) => (item.savedAdId ? <BookmarkCheck /> : <Bookmark />),
      isDisabled: (item) =>
        savedMutating || item.usagePolicy === 'disclosure_only',
      onClick: (item) => onToggleSaved([item]),
      tooltip: (item) =>
        translateAds(
          item.savedAdId ? 'swipeFile.unsaveAction' : 'swipeFile.saveAction',
        ),
    },
  ];

  return (
    <Table<AdsResearchItem>
      actions={actions}
      ariaLabel={translate('tableLabel')}
      columns={columns}
      emptyLabel={
        search.trim()
          ? translateSwipeFile('emptySearch')
          : translateSwipeFile(
              isSavedView ? 'emptyFilters' : 'emptyLiveFilters',
            )
      }
      getRowClassName={(item) =>
        getAdSelectionKey(item) === selectedKey ? 'bg-primary/5' : ''
      }
      getRowKey={(item) =>
        item.source === 'my_accounts'
          ? `connected-${item.sourceId}`
          : `public-${item.id}`
      }
      items={ads}
      onRowClick={onSelect}
    />
  );
}
