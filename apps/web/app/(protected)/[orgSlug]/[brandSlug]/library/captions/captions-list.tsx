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
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
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
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

/** Columns the captions endpoint can order by. */
const EMPTY_CAPTIONS: Caption[] = [];

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

  const getCaptionsService = useAuthedService(
    useCallback((token: string) => CaptionsService.getInstance(token), []),
  );

  const [captionsPage, setCaptionsPage] =
    useState<IPaginatedResponse<Caption> | null>(null);
  const captions = captionsPage?.items ?? EMPTY_CAPTIONS;
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  // Only the latest request may fill the list, so a slow response for an
  // earlier sort or search cannot replace the current one.
  const requestRef = useRef<AbortController | null>(null);

  const findAllCaptions = useCallback(async () => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setCaptionsPage(null);
    setIsLoading(true);
    setLoadError(null);

    try {
      const service = await getCaptionsService();
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        ...(search ? { search } : {}),
        ...(sort ? { sort } : {}),
      };

      const data = await service.findAllPage(query, request.signal);
      if (request.signal.aborted) {
        return;
      }
      setCaptionsPage(data);
      setIsLoading(false);
      setLoadError(null);
      logger.info('GET /captions success', data.items);
    } catch (error) {
      if (request.signal.aborted) {
        return;
      }
      logger.error('GET /captions failed', error);
      notificationsService.error('Failed to load captions');
      setCaptionsPage(null);
      setIsLoading(false);
      setLoadError('Captions could not be loaded.');
    }
  }, [currentPage, getCaptionsService, notificationsService, search, sort]);

  useEffect(() => {
    void findAllCaptions();
    return () => requestRef.current?.abort();
  }, [findAllCaptions]);

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
                void findAllCaptions();
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
