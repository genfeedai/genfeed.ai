'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IQueryParams } from '@genfeedai/contracts/interfaces';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
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
import { Suspense, useEffect } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

const EMPTY_SCENES: ElementScene[] = [];

function settingsScenesQueryKey(organizationId: string) {
  return ['settings-scenes', organizationId] as const;
}

/** Columns the scenes endpoint can order by. */
const SCENE_SORT_KEYS = ['label', 'key'];

function ScenesListContent() {
  const { organizationId } = useBrand();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const searchT = useTranslations('common.listSearch');
  const { search, setSearch } = useAdminSearchParam();
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: SCENE_SORT_KEYS,
  });

  // The scenes read through React Query, so coming back to the list paints
  // the cached rows at once and refreshes them in the background; another
  // page, search or sort keeps the current rows on screen while it loads.
  const scopeKey = settingsScenesQueryKey(organizationId);
  const scenesQuery = usePagedAuthedQuery<ScenesService, ElementScene>({
    keepPreviousDataWithin: scopeKey,
    queryFn: async (service, signal) => {
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        ...(search ? { search } : {}),
        ...(sort ? { sort } : {}),
      };
      const data = await service.findAllPage(query, signal);
      logger.info('GET /scenes success', data.items);
      return data;
    },
    queryKey: [...scopeKey, { page: currentPage, search, sort: sort ?? null }],
    service: (token: string) => ScenesService.getInstance(token),
  });
  const scenesPage = scenesQuery.data;
  const scenes = scenesPage?.items ?? EMPTY_SCENES;
  const isLoading = scenesQuery.isPending;

  const { error: loadError } = scenesQuery;
  useEffect(() => {
    if (!loadError) {
      return;
    }
    logger.error('GET /scenes failed', loadError);
    NotificationsService.getInstance().error('Failed to load scenes');
  }, [loadError]);

  const columns: TableColumn<ElementScene>[] = [
    {
      header: 'Label',
      key: 'label',
      sortable: true,
      subtext: (scene: ElementScene) => scene.description,
    },
    {
      className: 'font-mono text-sm',
      header: 'Key',
      key: 'key',
      sortable: true,
    },
  ];

  const rowSidebar = useElementRowSidebar<ElementScene>();

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
        items={scenes}
        columns={columns}
        actions={[]}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        rowSidebar={rowSidebar}
        emptyLabel="No scenes found"
      />

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel="scenes"
          totals={scenesPage?.totals ?? EMPTY_PAGE_TOTALS}
        />
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
