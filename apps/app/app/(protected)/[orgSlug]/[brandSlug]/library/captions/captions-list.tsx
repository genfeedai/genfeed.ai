'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { AlertCategory, ButtonVariant } from '@genfeedai/enums';
import type { IQueryParams } from '@genfeedai/interfaces';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Caption } from '@models/content/caption.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { CaptionsService } from '@services/content/captions.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import AppTable from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

function CaptionsListContent() {
  const notificationsService = NotificationsService.getInstance();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;

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
      render: (caption: Caption) => caption.format || '-',
    },
    {
      header: 'Created',
      key: 'createdAt',
      render: (caption: Caption) =>
        caption.createdAt ? formatDate(caption.createdAt) : '-',
    },
  ];

  const findAllCaptions = useCallback(async () => {
    setCaptions(null);
    setLoadError(null);

    try {
      const service = await getCaptionsService();
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
      };

      const data = await service.findAll(query);
      setCaptions(data);
      setLoadError(null);
      logger.info('GET /captions success', data);
    } catch (error) {
      logger.error('GET /captions failed', error);
      notificationsService.error('Failed to load captions');
      setCaptions([]);
      setLoadError('Captions could not be loaded.');
    }
  }, [currentPage, getCaptionsService, notificationsService]);

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
              variant={ButtonVariant.OUTLINE}
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
