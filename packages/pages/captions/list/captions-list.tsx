'use client';

import type { IQueryParams } from '@cloud/interfaces';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Caption } from '@models/content/caption.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { CaptionsService } from '@services/content/captions.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function CaptionsList() {
  const notificationsService = NotificationsService.getInstance();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams?.get('page')) || 1;

  const getCaptionsService = useAuthedService(
    useCallback((token: string) => CaptionsService.getInstance(token), []),
  );

  const [captions, setCaptions] = useState<Caption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    setIsLoading(true);

    try {
      const service = await getCaptionsService();
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
      };

      const data = await service.findAll(query);
      setCaptions(data);
      logger.info('GET /captions success', data);
    } catch (error) {
      logger.error('GET /captions failed', error);
      notificationsService.error('Failed to load captions');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, getCaptionsService, notificationsService]);

  useEffect(() => {
    findAllCaptions();
  }, [findAllCaptions]);

  return (
    <>
      <AppTable<Caption>
        items={captions}
        columns={columns}
        actions={[]}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No captions found"
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="captions" />
      </div>
    </>
  );
}
