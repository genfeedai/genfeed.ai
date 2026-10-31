'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IQueryParams } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementScene } from '@models/elements/scene.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ScenesService } from '@services/elements/scenes.service';
import { useElementRowSidebar } from '@ui/display/element-scope-badge/element-row-sidebar';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';

function ScenesListContent() {
  const notificationsService = NotificationsService.getInstance();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const searchT = useTranslations('common.listSearch');
  const { search, setSearch } = useAdminSearchParam();

  const getScenesService = useAuthedService(
    useCallback((token: string) => ScenesService.getInstance(token), []),
  );

  const [scenes, setScenes] = useState<ElementScene[] | null>(null);

  const isLoading = scenes === null;

  const columns: TableColumn<ElementScene>[] = [
    {
      header: 'Label',
      key: 'label',
      subtext: (scene: ElementScene) => scene.description,
    },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
  ];

  const rowSidebar = useElementRowSidebar<ElementScene>();

  const findAllScenes = useCallback(async () => {
    setScenes(null);

    try {
      const service = await getScenesService();
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        ...(search ? { search } : {}),
      };

      const data = await service.findAll(query);
      setScenes(data);
      logger.info('GET /scenes success', data);
    } catch (error) {
      logger.error('GET /scenes failed', error);
      notificationsService.error('Failed to load scenes');
      setScenes([]);
    }
  }, [currentPage, getScenesService, notificationsService, search]);

  useEffect(() => {
    findAllScenes();
  }, [findAllScenes]);

  return (
    <Container
      label="Scenes"
      leading={
        <SearchField
          ariaLabel={searchT('scenes')}
          onSearch={setSearch}
          placeholder={searchT('scenes')}
          value={search}
        />
      }
    >
      <AppTable<ElementScene>
        items={scenes ?? []}
        columns={columns}
        actions={[]}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
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
