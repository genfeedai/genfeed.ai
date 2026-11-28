'use client';

import {
  OUTLIER_LIBRARY_PLATFORMS,
  type OutlierLibraryPlatform,
  type OutlierLibraryPostResponse,
  type OutlierLibraryTier,
} from '@genfeedai/contracts/interfaces';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import {
  formatCompactNumber,
  formatOutlierMultiple,
} from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import type { TableColumn } from '@props/ui/display/table.props';
import { OutlierLibraryService } from '@services/analytics/outlier-library.service';
import { logger } from '@services/core/logger.service';
import SearchField from '@ui/content/search-field/SearchField';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Table from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import FilterMenu from '@ui/navigation/filter-menu/FilterMenu';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Badge } from '@ui/primitives/badge';
import { TrendingUp } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useOptionalDiscoveryRemix } from '@/features/research/remix/DiscoveryRemixProvider';
import {
  useResearchQueryState,
  useResearchSearchParamState,
} from '@/features/research/work-surface/ResearchWorkSurfaceProvider';
import OutlierPostPlayer from '@/features/trends/outliers/outlier-post-player';
import type { TrendsOutliersProps } from '@/features/trends/props/trends-outliers.props';

const PAGE_SIZE = 100;
/** YouTube joins once its platform policy step is done (#11639); until then it is left out. */
const SHOWN_PLATFORMS: readonly OutlierLibraryPlatform[] =
  OUTLIER_LIBRARY_PLATFORMS.filter((platform) => platform !== 'youtube');
const TIERS: readonly OutlierLibraryTier[] = ['outlier', 'breakout'];
const GROUP_VALUES = ['none', 'creator'] as const;
const SOURCE_OPTIONS = ['trends', 'imported', 'following', 'outliers'] as const;

type OutlierGroup = (typeof GROUP_VALUES)[number];

function readList<Value extends string>(
  raw: string,
  allowed: readonly Value[],
): Value[] {
  return raw
    .split(',')
    .filter((value): value is Value =>
      (allowed as readonly string[]).includes(value),
    );
}

/** Both choices selected is no choice at all, so the server gets no filter. */
function onlyOne<Value extends string>(
  values: readonly Value[],
  all: readonly Value[],
): Value | undefined {
  return values.length === 1 && all.length > 1 ? values[0] : undefined;
}

/**
 * The outliers view of Trends (#11643): public videos that beat their own
 * creator's typical post, biggest win first. A row opens the video in its
 * platform's own player; Genfeed keeps the link and the numbers only.
 */
export default function TrendsOutliers({
  onSourceChange,
}: TrendsOutliersProps) {
  const translate = useTranslations('common.trends.outliers');
  const translateDesk = useTranslations('common.trends.desk');
  const format = useFormatter();
  const remix = useOptionalDiscoveryRemix();
  const [search, setSearch] = useResearchQueryState();
  const [platformParam, setPlatformParam] = useResearchSearchParamState<string>(
    { defaultValue: '', key: 'platform', maxLength: 400 },
  );
  const [tierParam, setTierParam] = useResearchSearchParamState<string>({
    defaultValue: '',
    key: 'tier',
    maxLength: 400,
  });
  const [group, setGroup] = useResearchSearchParamState<OutlierGroup>({
    allowedValues: GROUP_VALUES,
    defaultValue: 'none',
    key: 'group',
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [pageState, setPageState] = useState({ filterKey: '', page: 1 });

  const platforms = readList(platformParam, SHOWN_PLATFORMS);
  const tiers = readList(tierParam, TIERS);
  const platform = onlyOne(platforms, SHOWN_PLATFORMS);
  const tier = onlyOne(tiers, TIERS);
  const query = search.trim();
  const filterKey = [platform ?? '', tier ?? '', query].join('|');
  const page = pageState.filterKey === filterKey ? pageState.page : 1;

  const postsQuery = useAuthedQuery({
    queryFn: async (service, signal) => {
      try {
        return await service.listPosts(
          {
            limit: PAGE_SIZE,
            page,
            ...(platform ? { platform } : {}),
            ...(query ? { search: query } : {}),
            ...(tier ? { tier } : {}),
          },
          signal,
        );
      } catch (error) {
        logger.error('GET /outlier-library failed', error);
        throw error;
      }
    },
    queryKey: ['outlier-library', platform ?? null, tier ?? null, query, page],
    service: (token: string) => OutlierLibraryService.getInstance(token),
  });

  const posts = useMemo(() => {
    const rows = (postsQuery.data?.docs ?? []).filter((post) =>
      (SHOWN_PLATFORMS as readonly string[]).includes(post.platform),
    );
    return group === 'creator'
      ? [...rows].sort(
          (left, right) =>
            left.creator.handle.localeCompare(right.creator.handle) ||
            right.outlierRatio - left.outlierRatio,
        )
      : rows;
  }, [group, postsQuery.data?.docs]);
  const total = postsQuery.data?.total ?? 0;

  const facets: FilterMenuFacet[] = [
    {
      defaultValue: 'all',
      key: 'source',
      label: translateDesk('filters.source'),
      onChange: onSourceChange,
      options: [
        { label: translateDesk('sourceTabs.all'), value: 'all' },
        ...SOURCE_OPTIONS.map((option) => ({
          label:
            option === 'following'
              ? translateDesk('following.title')
              : translateDesk(`sourceTabs.${option}`),
          value: option,
        })),
      ],
      selection: 'single',
      value: 'outliers',
    },
    {
      key: 'platform',
      label: translate('filters.platform'),
      onChange: (values) => setPlatformParam(values.join(',')),
      options: SHOWN_PLATFORMS.map((value) => ({
        icon: getPlatformIcon(value, 'size-4'),
        label: translate(`platforms.${value}`),
        value,
      })),
      selection: 'multiple',
      values: platforms,
    },
    {
      key: 'tier',
      label: translate('filters.tier'),
      onChange: (values) => setTierParam(values.join(',')),
      options: TIERS.map((value) => ({
        label: translate(`tiers.${value}`),
        value,
      })),
      selection: 'multiple',
      values: tiers,
    },
    {
      defaultValue: 'none',
      isCounted: false,
      key: 'group',
      label: translate('filters.group'),
      onChange: (value) => setGroup(value as OutlierGroup),
      options: GROUP_VALUES.map((value) => ({
        label: translate(`groups.${value}`),
        value,
      })),
      selection: 'single',
      value: group,
    },
  ];

  const columns = useMemo<TableColumn<OutlierLibraryPostResponse>[]>(
    () => [
      {
        className: 'w-80 max-w-80',
        header: translate('columns.video'),
        key: 'caption',
        render: (post) => (
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
            >
              {getPlatformIcon(post.platform, 'size-4')}
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium">
                {post.captionExcerpt ||
                  translate('videoBy', { handle: post.creator.handle })}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {[`@${post.creator.handle}`, post.format]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>
        ),
        sortable: false,
      },
      {
        header: translate('columns.platform'),
        key: 'platform',
        render: (post) => <PlatformBadge platform={post.platform} />,
      },
      {
        header: translate('columns.views'),
        key: 'views',
        render: (post) => formatCompactNumber(post.views),
        sortValue: (post) => post.views,
      },
      {
        header: translate('columns.typical'),
        key: 'medianViews',
        render: (post) =>
          `${formatCompactNumber(post.medianViews)} (${post.sampleSize})`,
        sortValue: (post) => post.medianViews,
      },
      {
        header: translate('columns.multiple'),
        key: 'outlierRatio',
        render: (post) => (
          <span className="font-semibold">
            {formatOutlierMultiple(post.outlierRatio)}
          </span>
        ),
        sortValue: (post) => post.outlierRatio,
      },
      {
        header: translate('columns.tier'),
        key: 'outlierTier',
        render: (post) => <Badge value={post.outlierTier} />,
        sortable: false,
      },
      {
        className: 'whitespace-nowrap',
        header: translate('columns.posted'),
        key: 'publishedAt',
        render: (post) =>
          format.dateTime(new Date(post.publishedAt), {
            day: 'numeric',
            month: 'short',
          }),
        sortValue: (post) => post.publishedAt,
      },
    ],
    [format, translate],
  );

  const handleRemix = (post: OutlierLibraryPostResponse) => {
    remix
      ?.openRemix({ kind: 'outlier_post', outlierPostId: post.id })
      .catch(() => {
        /* surfaced via provider status */
      });
  };

  return (
    <Container
      icon={TrendingUp}
      label={translateDesk('title')}
      leading={
        <SearchField
          ariaLabel={translate('searchLabel')}
          onSearch={setSearch}
          placeholder={translate('searchPlaceholder')}
          value={search}
        >
          <FilterMenu
            align="start"
            allLabel={translateDesk('filters.all')}
            clearLabel={translateDesk('filters.clear')}
            facets={facets}
            getActiveCountLabel={(count) =>
              translateDesk('filters.activeCount', { count })
            }
            isAttached
            label={translateDesk('filters.menu')}
            onClear={() => {
              setPlatformParam('');
              setTierParam('');
              setGroup('none');
              onSourceChange('outliers');
            }}
          />
        </SearchField>
      }
    >
      <p className="text-sm text-muted-foreground">{translate('intro')}</p>
      <Table<OutlierLibraryPostResponse>
        activeRowId={openId}
        ariaLabel={translate('tableLabel')}
        columns={columns}
        emptyLabel={translate('empty')}
        error={
          postsQuery.isError && !postsQuery.data
            ? {
                onRetry: () => void postsQuery.refetch(),
                title: translate('loadError'),
              }
            : undefined
        }
        getGroupHeading={
          group === 'creator'
            ? (post) => ({
                content: (
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                    @{post.creator.handle}
                  </div>
                ),
                key: post.creator.id,
              })
            : undefined
        }
        getItemId={(post) => post.id}
        getRowKey={(post) => post.id}
        isLoading={postsQuery.isLoading}
        items={posts}
        onRowClick={(post) =>
          setOpenId((current) => (current === post.id ? null : post.id))
        }
        renderExpandedRow={(post) =>
          post.id === openId ? (
            <div className="max-w-4xl whitespace-normal p-4">
              <OutlierPostPlayer
                isRemixAvailable={Boolean(remix)}
                onRemix={handleRemix}
                post={post}
              />
            </div>
          ) : undefined
        }
      />
      <Pagination
        currentPage={page}
        onPageChange={(nextPage) => setPageState({ filterKey, page: nextPage })}
        totalItems={total}
        totalLabel={translate('totalLabel')}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      />
      <p className="text-xs text-muted-foreground">{translate('footnote')}</p>
    </Container>
  );
}
