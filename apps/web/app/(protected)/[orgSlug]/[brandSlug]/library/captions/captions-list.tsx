'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type {
  IPaginatedResponse,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import type { Caption } from '@models/content/caption.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { CaptionsService } from '@services/content/captions.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Alert, AlertActions, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect } from 'react';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

const EMPTY_CAPTIONS: Caption[] = [];

/** Columns the captions endpoint can order by. */
const CAPTION_SORT_KEYS = ['format', 'createdAt'];

function CaptionsListContent() {
  const rowSidebarT = useTranslations('ui.rowSidebar');
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const notificationsService = NotificationsService.getInstance();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const search = searchParams.get('q') ?? '';
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: CAPTION_SORT_KEYS,
  });

  const { orgId, userId } = useAuthIdentity();

  // Captions belong to the signed-in member in their organization. Each
  // page, search and sort is cached, so returning paints the last list at
  // once and refreshes it in the background; a new page, search or sort
  // keeps the current rows on screen while it loads.
  const scopeKey = ['library-captions', orgId ?? null, userId ?? null];
  const captionsQuery = useAuthedQuery<
    CaptionsService,
    IPaginatedResponse<Caption>
  >({
    keepPreviousDataWithin: scopeKey,
    queryFn: async (service, signal) => {
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        ...(search ? { search } : {}),
        ...(sort ? { sort } : {}),
      };
      try {
        return await service.findAllPage(query, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /captions failed', error);
        }
        throw error;
      }
    },
    queryKey: [...scopeKey, { page: currentPage, search, sort: sort ?? null }],
    service: (token: string) => CaptionsService.getInstance(token),
  });

  const captionsPage = captionsQuery.data;
  const captions = captionsPage?.items ?? EMPTY_CAPTIONS;
  const hasCaptions = captionsPage !== undefined;
  const queryError = captionsQuery.error;
  // An error replaces the list only when there is nothing to show; a retry
  // brings the loading rows back while it runs.
  const loadError =
    queryError && !hasCaptions && !captionsQuery.isFetching
      ? 'Captions could not be loaded.'
      : null;
  const isLoading = !hasCaptions && !loadError;
  const { refetch } = captionsQuery;

  useEffect(() => {
    if (queryError && !hasCaptions) {
      notificationsService.error('Failed to load captions');
    }
  }, [hasCaptions, notificationsService, queryError]);

  const columns: TableColumn<Caption>[] = [
    { header: 'Label', key: 'label' },
    {
      header: 'Format',
      key: 'format',
      sortable: true,
      render: (caption: Caption) => caption.format || '-',
    },
    {
      header: 'Created',
      key: 'createdAt',
      sortable: true,
      render: (caption: Caption) => <TableDateCell value={caption.createdAt} />,
    },
  ];

  const rowSidebar = createSummaryRowSidebar<Caption>({
    getFacts: (caption) => [
      { id: 'format', label: fieldsT('format'), value: caption.format },
      { id: 'language', label: fieldsT('language'), value: caption.language },
      {
        id: 'created',
        label: fieldsT('created'),
        value: caption.createdAt ? formatDate(caption.createdAt) : undefined,
      },
    ],
    getId: (caption) => caption.id,
    getTitle: (caption) =>
      [caption.format, caption.language].filter(Boolean).join(' · ') ||
      rowSidebarT('caption.fallbackTitle'),
    kind: 'record',
  });

  return (
    <>
      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
          <AlertActions>
            <Button
              label="Retry"
              variant={ButtonVariant.SECONDARY}
              onClick={() => {
                void refetch();
              }}
            />
          </AlertActions>
        </Alert>
      ) : (
        <>
          <AppTable<Caption>
            items={captions}
            columns={columns}
            actions={[]}
            isLoading={isLoading}
            getRowKey={(item) => item.id}
            onSortChange={onSortChange}
            sortDirection={sortDirection}
            sortKey={sortKey}
            rowSidebar={rowSidebar}
            emptyLabel="No captions found"
          />

          <div className="mt-4">
            <AutoPagination
              showTotal
              totalLabel="captions"
              totals={
                captionsPage
                  ? {
                      totalDocs: captionsPage.total,
                      totalPages: captionsPage.totalPages,
                    }
                  : EMPTY_PAGE_TOTALS
              }
            />
          </div>
        </>
      )}
    </>
  );
}

export default function CaptionsList() {
  return (
    <Suspense fallback={null}>
      <CaptionsListContent />
    </Suspense>
  );
}
