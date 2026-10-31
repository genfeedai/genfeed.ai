'use client';

import { AlertCategory, ButtonVariant } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IQueryParams } from '@genfeedai/contracts/interfaces';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Caption } from '@models/content/caption.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { CaptionsService } from '@services/content/captions.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

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

  const getCaptionsService = useAuthedService(
    useCallback((token: string) => CaptionsService.getInstance(token), []),
  );

  const [captions, setCaptions] = useState<Caption[] | null>(null);
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
      render: (caption: Caption) =>
        caption.createdAt ? formatDate(caption.createdAt) : '-',
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
  const latestRequestRef = useRef(0);

  const findAllCaptions = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    setCaptions(null);
    setLoadError(null);

    try {
      const service = await getCaptionsService();
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        ...(search ? { search } : {}),
        ...(sort ? { sort } : {}),
      };

      const data = await service.findAll(query);
      if (requestId !== latestRequestRef.current) {
        return;
      }
      setCaptions(data);
      setLoadError(null);
      logger.info('GET /captions success', data);
    } catch (error) {
      if (requestId !== latestRequestRef.current) {
        return;
      }
      logger.error('GET /captions failed', error);
      notificationsService.error('Failed to load captions');
      setCaptions([]);
      setLoadError('Captions could not be loaded.');
    }
  }, [currentPage, getCaptionsService, notificationsService, search, sort]);

  useEffect(() => {
    findAllCaptions();
  }, [findAllCaptions]);

  return (
    <>
      {loadError ? (
        <Alert type={AlertCategory.ERROR}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{loadError}</span>
            <Button
              label="Retry"
              variant={ButtonVariant.SECONDARY}
              onClick={() => {
                void findAllCaptions();
              }}
            />
          </div>
        </Alert>
      ) : (
        <>
          <AppTable<Caption>
            items={captions ?? []}
            columns={columns}
            actions={[]}
            isLoading={captions === null}
            getRowKey={(item) => item.id}
            onSortChange={onSortChange}
            sortDirection={sortDirection}
            sortKey={sortKey}
            rowSidebar={rowSidebar}
            emptyLabel="No captions found"
          />

          <div className="mt-4">
            <AutoPagination showTotal totalLabel="captions" />
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
