'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import type { IQueryParams } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementScene } from '@models/elements/scene.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ScenesService } from '@services/elements/scenes.service';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

function ScenesListContent() {
  const notificationsService = NotificationsService.getInstance();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;

  const getScenesService = useAuthedService(
    useCallback((token: string) => ScenesService.getInstance(token), []),
  );

  const [scenes, setScenes] = useState<ElementScene[] | null>(null);

  const isLoading = scenes === null;

  const columns: TableColumn<ElementScene>[] = [
    { header: 'Label', key: 'label' },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Description',
      key: 'description',
      render: (scene: ElementScene) => scene.description || '-',
    },
  ];

  const findAllScenes = useCallback(async () => {
    setScenes(null);

    try {
      const service = await getScenesService();
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
      };

      const data = await service.findAll(query);
      setScenes(data);
      logger.info('GET /scenes success', data);
    } catch (error) {
      logger.error('GET /scenes failed', error);
      notificationsService.error('Failed to load scenes');
      setScenes([]);
    }
  }, [currentPage, getScenesService, notificationsService]);

  useEffect(() => {
    findAllScenes();
  }, [findAllScenes]);

  return (
    <Container
      label="Scenes"
      description="Reusable scene elements for generation"
    >
      <AppTable<ElementScene>
        items={scenes ?? []}
        columns={columns}
        actions={[]}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No scenes found"
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="scenes" />
      </div>
    </Container>
  );
}

export default function ScenesList() {
  return (
    <Suspense fallback={null}>
      <ScenesListContent />
    </Suspense>
  );
}
