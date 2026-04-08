'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { AnalyticsMetric, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import {
  AnalyticsService,
  type IOrgWithStats,
  type IPaginatedOrgsResponse,
} from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import AppTable from '@ui/display/table/Table';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import FormDropdown from '@ui/primitives/dropdown-field';
import { format } from 'date-fns';
import Image from 'next/image';
import Link from 'next/link';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { HiArrowsUpDown, HiChevronLeft, HiChevronRight } from 'react-icons/hi2';

export interface AnalyticsOrganizationsListProps {
  basePath?: string;
}

export default function AnalyticsOrganizationsList({
  basePath = '/analytics',
}: AnalyticsOrganizationsListProps) {
  const { dateRange, refreshTrigger } = useAnalyticsContext();

  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const [data, setData] = useState<IPaginatedOrgsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<
    AnalyticsMetric.ENGAGEMENT | AnalyticsMetric.VIEWS | AnalyticsMetric.POSTS
  >(AnalyticsMetric.ENGAGEMENT);

  const fetchData = useCallback(
    async (showLoading = true) => {
      if (!dateRange.startDate || !dateRange.endDate) {
        return;
      }

      try {
        if (showLoading) {
          setIsLoading(true);
        }

        const service = await getAnalyticsService();
        const response = await service.getOrganizationsWithStats({
          endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
          limit: ITEMS_PER_PAGE,
          page,
          sort,
          startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
        });
        setData(response);
      } catch (error) {
        logger.error('Failed to fetch organizations', error);
      } finally {
        setIsLoading(false);
      }
    },
    [getAnalyticsService, dateRange, page, sort],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchData(false);
    }
  }, [refreshTrigger, fetchData]);

  const handleSortChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setSort(
      e.target.value as
        | AnalyticsMetric.ENGAGEMENT
        | AnalyticsMetric.VIEWS
        | AnalyticsMetric.POSTS,
    );
    setPage(1);
  };

  const orgs = data?.data || [];
  const pagination = data?.pagination;

  const columns: TableColumn<IOrgWithStats>[] = useMemo(
    () => [
      {
        header: 'Organization',
        key: 'name',
        render: (org) => (
          <Link
            href={`${basePath}/organizations/${org.id}`}
            className="flex items-center gap-3 hover:text-primary"
          >
            {org.logo ? (
              <Image
                src={org.logo}
                alt={org.name || 'Organization'}
                width={32}
                height={32}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                {(org.name || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-medium">{org.name || 'Unknown'}</span>
          </Link>
        ),
      },
      {
        className: 'text-right',
        header: 'Posts',
        key: 'totalPosts',
        render: (org) => (
          <span className="font-mono">{org.totalPosts.toLocaleString()}</span>
        ),
      },
      {
        className: 'text-right',
        header: 'Engagement',
        key: 'totalEngagement',
        render: (org) => (
          <span className="font-mono">
            {org.totalEngagement.toLocaleString()}
          </span>
        ),
      },
      {
        className: 'text-right',
        header: 'Views',
        key: 'totalViews',
        render: (org) => (
          <span className="font-mono">{org.totalViews.toLocaleString()}</span>
        ),
      },
      {
        className: 'text-right',
        header: 'Brands',
        key: 'totalBrands',
        render: (org) => <span className="font-mono">{org.totalBrands}</span>,
      },
      {
        className: 'text-right',
        header: 'Growth',
        key: 'growth',
        render: (org) => (
          <span
            className={`font-mono ${
              org.growth > 0
                ? 'text-success'
                : org.growth < 0
                  ? 'text-error'
                  : 'text-foreground/60'
            }`}
          >
            {org.growth > 0 ? '+' : ''}
            {org.growth.toFixed(1)}%
          </span>
        ),
      },
      {
        className: 'text-right',
        header: 'Created',
        key: 'createdAt',
        render: (org) => (
          <span className="text-sm text-foreground/60">
            {new Date(org.createdAt).toLocaleDateString()}
          </span>
        ),
      },
    ],
    [basePath],
  );

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          All Organizations
          {pagination && (
            <span className="text-sm font-normal text-foreground/60 ml-2">
              ({pagination.total} total)
            </span>
          )}
        </h2>
        <FormDropdown
          name="sort"
          icon={<HiArrowsUpDown className="w-4 h-4" />}
          label="Sort"
          variant={ButtonVariant.SECONDARY}
          className="h-10 px-3 gap-2 text-sm flex-shrink-0"
          value={sort}
          onChange={handleSortChange}
          isFullWidth={false}
          options={[
            { key: AnalyticsMetric.ENGAGEMENT, label: 'By Engagement' },
            { key: AnalyticsMetric.VIEWS, label: 'By Views' },
            { key: AnalyticsMetric.POSTS, label: 'By Posts' },
          ]}
        />
      </div>

      <AppTable<IOrgWithStats>
        items={orgs}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(org) => org.id}
        emptyLabel="No organizations found"
      />

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-foreground/60">
            Showing {(page - 1) * pagination.limit + 1} -{' '}
            {Math.min(page * pagination.limit, pagination.total)} of{' '}
            {pagination.total}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              isDisabled={page === 1}
              onClick={() => setPage(page - 1)}
              icon={<HiChevronLeft className="w-4 h-4" />}
            />
            <span className="text-sm">
              Page {page} of {pagination.totalPages}
            </span>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              isDisabled={page === pagination.totalPages}
              onClick={() => setPage(page + 1)}
              icon={<HiChevronRight className="w-4 h-4" />}
            />
          </div>
        </div>
      )}
    </div>
  );
}
