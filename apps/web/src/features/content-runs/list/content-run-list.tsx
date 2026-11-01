'use client';

import {
  ButtonVariant,
  CardPadding,
  ContentRunStatus,
} from '@genfeedai/contracts';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { ContentRunBrief } from '@genfeedai/contracts/interfaces';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ContentRunRecord } from '@services/content/content-runs.service';
import { ContentRunsService } from '@services/content/content-runs.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import LoadingState from '@ui/feedback/LoadingState';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { CirclePlay, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import SearchField from '@/components/content/search-field/SearchField';

const ALL_STATUSES = 'all';

const STATUS_OPTIONS = [
  { label: 'Pending', value: ContentRunStatus.PENDING },
  { label: 'Running', value: ContentRunStatus.RUNNING },
  { label: 'Completed', value: ContentRunStatus.COMPLETED },
  { label: 'Failed', value: ContentRunStatus.FAILED },
];

const EMPTY_RUNS: ContentRunRecord[] = [];

function getRunId(run: ContentRunRecord): string {
  return run.id;
}

function getRunTitle(brief?: ContentRunBrief): string {
  return brief?.angle ?? brief?.hypothesis ?? brief?.sourceId ?? 'Untitled run';
}

function getVariantCount(run: ContentRunRecord): number {
  return run.variants?.length ?? 0;
}

function getPublishCount(run: ContentRunRecord): number {
  if (!run.publish) {
    return 0;
  }

  return Array.isArray(run.publish) ? run.publish.length : 1;
}

export default function ContentRunListPage() {
  const translate = useTranslations('common.automation.contentRuns');
  const translateMenu = useTranslations('ui.filtersButton');
  const collectionScope = useCollectionScope();
  const { brandId, pageScope } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const { href } = useOrgUrl();
  const [status, setStatus] = useState<string>(ALL_STATUSES);
  const pathname = usePathname();
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const currentPage = Number(searchParams.get('page')) || 1;
  const { search, setSearch } = useAdminSearchParam();

  // A new filter changes the result set, so restart from the first page.
  const handleStatusChange = useCallback(
    (nextStatus: string) => {
      setStatus(nextStatus);
      const params = new URLSearchParams(searchParamsString);
      if (params.has('page')) {
        params.delete('page');
        const query = params.toString();
        replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }
    },
    [pathname, replace, searchParamsString],
  );
  const getContentRunsService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );

  const {
    data = EMPTY_RUNS,
    isError,
    isFetching,
    refetch,
  } = useQuery<ContentRunRecord[]>({
    enabled: isBrandReady,
    // placeholderData, never initialData: the shared QueryClient has a 30s
    // staleTime, and initialData is treated as a fresh cache entry, so the
    // list would mount empty and skip the fetch until something invalidated it.
    placeholderData: EMPTY_RUNS,
    queryFn: async ({ signal }) => {
      if (!brandId) {
        return EMPTY_RUNS;
      }
      const service = await getContentRunsService();
      return service.list(
        brandId,
        {
          limit: ITEMS_PER_PAGE,
          page: currentPage,
          ...(search ? { search } : {}),
          status:
            status === ALL_STATUSES ? undefined : (status as ContentRunStatus),
        },
        signal,
      );
    },
    queryKey: ['content-runs', brandId, status, currentPage, search],
  });

  const isInitialFetch = isFetching && data.length === 0;

  const searchField = (
    <SearchField
      ariaLabel={translate('search')}
      onSearch={setSearch}
      placeholder={translate('search')}
      value={search}
    >
      <FilterMenu
        facets={[
          {
            defaultValue: ALL_STATUSES,
            key: 'status',
            label: translate('statusFilter'),
            onChange: handleStatusChange,
            options: [
              { label: translateMenu('all'), value: ALL_STATUSES },
              ...STATUS_OPTIONS,
            ],
            selection: 'single',
            value: status,
          },
        ]}
        isAttached
        onClear={() => handleStatusChange(ALL_STATUSES)}
      />
    </SearchField>
  );

  return (
    <Container label="Content Runs" icon={CirclePlay} leading={searchField}>
      {pageScope === 'org' && !isBrandReady ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {translate('selectBrand')}
        </p>
      ) : null}
      {isError ? (
        <ErrorFallback
          compact={data.length > 0}
          title={translate('loadError')}
          resetErrorBoundary={() => refetch()}
        />
      ) : null}

      {isInitialFetch ? (
        <div className="min-h-64">
          <LoadingState isFullSize />
        </div>
      ) : null}

      {(!isError || data.length > 0) && !isInitialFetch && isBrandReady ? (
        <div className="space-y-4">
          {data.length ? (
            <>
              <Card padding={CardPadding.NONE}>
                <div className="divide-y divide-border">
                  {data.map((run) => (
                    <ContentRunRow
                      key={getRunId(run)}
                      detailHref={href(
                        `${APP_ROUTES.AUTOMATION.CONTENT_RUNS}/${getRunId(run)}`,
                      )}
                      run={run}
                    />
                  ))}
                </div>
              </Card>
              <AutoPagination showTotal totalLabel="runs" />
            </>
          ) : (
            <CardEmpty
              icon={Sparkles}
              label={
                search
                  ? translate('emptySearchTitle')
                  : status === ALL_STATUSES
                    ? translate('emptyTitle')
                    : translate('emptyFilteredTitle')
              }
              action={
                status !== ALL_STATUSES
                  ? {
                      label: translate('clearFilter'),
                      onClick: () => handleStatusChange(ALL_STATUSES),
                    }
                  : undefined
              }
              actions={
                status === ALL_STATUSES && !search ? (
                  <Button
                    asChild
                    variant={ButtonVariant.SECONDARY}
                    withWrapper={false}
                  >
                    <Link href={href(APP_ROUTES.DISCOVERY.ROOT)}>
                      {translate('goToDiscovery')}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      ) : null}
    </Container>
  );
}

function ContentRunRow({
  detailHref,
  run,
}: {
  detailHref: string;
  run: ContentRunRecord;
}) {
  const variantCount = getVariantCount(run);
  const publishCount = getPublishCount(run);

  return (
    <Link
      className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-accent"
      href={detailHref}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">
          {getRunTitle(run.brief)}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/60">
          <span>{run.skillSlug ?? 'content-run'}</span>
          <span>
            {variantCount} {variantCount === 1 ? 'variant' : 'variants'}
          </span>
          <span>
            {publishCount} {publishCount === 1 ? 'publish' : 'publishes'}
          </span>
          {run.createdAt ? <span>{getRelativeTime(run.createdAt)}</span> : null}
        </div>
      </div>
      <Badge status={run.status ?? ContentRunStatus.PENDING} />
    </Link>
  );
}
