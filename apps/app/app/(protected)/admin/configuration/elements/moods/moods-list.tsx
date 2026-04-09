'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModalEnum, PageScope } from '@genfeedai/enums';
import type { IElementMood, IQueryParams } from '@genfeedai/interfaces';
import type { IElementContentProps } from '@genfeedai/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementMood } from '@models/elements/mood.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { MoodsService } from '@services/elements/moods.service';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import { LazyModalMood } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';

export default function MoodsList({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps): ReactNode {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const currentPage = Number(searchParams?.get('page')) || 1;

  // Admin org/brand filter state (superadmin only)
  const [adminOrg, setAdminOrg] = useState(
    () => parsedSearchParams.get('organization') || '',
  );
  const [adminBrand, setAdminBrand] = useState(
    () => parsedSearchParams.get('brand') || '',
  );

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
      setAdminOrg(orgId);
      setAdminBrand('');
      const params = new URLSearchParams(searchParamsString);
      if (orgId) {
        params.set('organization', orgId);
      } else {
        params.delete('organization');
      }
      params.delete('brand');
      params.delete('page');
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsString],
  );

  const handleAdminBrandChange = useCallback(
    (brandId: string) => {
      setAdminBrand(brandId);
      const params = new URLSearchParams(searchParamsString);
      if (brandId) {
        params.set('brand', brandId);
      } else {
        params.delete('brand');
      }
      params.delete('page');
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsString],
  );

  const getMoodsService = useAuthedService(
    useCallback((token: string) => MoodsService.getInstance(token), []),
  );

  const [moods, setMoods] = useState<ElementMood[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [_isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMood, setSelectedMood] = useState<IElementMood | null>(null);

  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  const columns: TableColumn<ElementMood>[] = [
    { header: 'Label', key: 'label' },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Description',
      key: 'description',
      render: (mood: ElementMood) => mood.description || '-',
    },
  ];

  const findAllMoods = useCallback(
    async (isRefreshRequest = false) => {
      setIsRefreshing(isRefreshRequest);
      setIsLoading(!isRefreshRequest);
      onRefreshingChangeRef.current?.(isRefreshRequest);
      onLoadingChangeRef.current?.(!isRefreshRequest);

      try {
        const service = await getMoodsService();
        const query: IQueryParams = {
          limit: ITEMS_PER_PAGE,
          page: currentPage,
        };

        if (scope === PageScope.SUPERADMIN) {
          if (adminOrg) {
            query.organization = adminOrg;
          }
          if (adminBrand) {
            query.brand = adminBrand;
          }
        }

        const data = await service.findAll(query);
        setMoods(data);
        logger.info('GET /moods success', data);

        if (isRefreshRequest) {
          notificationsService.success('Moods refreshed');
        }
      } catch (error) {
        logger.error('GET /moods failed', error);
        notificationsService.error('Failed to load moods');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        onLoadingChangeRef.current?.(false);
        onRefreshingChangeRef.current?.(false);
      }
    },
    [
      currentPage,
      getMoodsService,
      notificationsService,
      scope,
      adminOrg,
      adminBrand,
    ],
  );

  useEffect(() => {
    findAllMoods();
  }, [findAllMoods]);

  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => findAllMoods(true));
    }
  }, [onRefresh, findAllMoods]);

  function openMoodModal(modalId: ModalEnum, mood?: IElementMood): void {
    setSelectedMood(mood ?? null);
    openModal(modalId);
  }

  async function handleDelete(): Promise<void> {
    if (!selectedMood) {
      return;
    }

    try {
      const service = await getMoodsService();
      await service.delete(selectedMood.id);
      notificationsService.success('Mood deleted');
      setSelectedMood(null);
      findAllMoods(true);
    } catch (error) {
      logger.error('Failed to delete mood', error);
      notificationsService.error('Failed to delete mood');
      setSelectedMood(null);
    }
  }

  function handleConfirmDelete(mood: ElementMood): void {
    setSelectedMood(mood);
    openConfirm({
      confirmLabel: 'Delete',
      isError: true,
      label: 'Delete Mood',
      message: `Are you sure you want to delete "${mood.label}"? This action cannot be undone.`,
      onConfirm: handleDelete,
    });
  }

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <HiPencil />,
            onClick: (mood: ElementMood) => openMoodModal(ModalEnum.MOOD, mood),
            tooltip: 'Edit',
          },
          {
            icon: <HiTrash />,
            onClick: handleConfirmDelete,
            tooltip: 'Delete',
          },
        ]
      : [];

  return (
    <>
      {scope === PageScope.SUPERADMIN && (
        <div className="mb-4">
          <AdminOrgBrandFilter
            organization={adminOrg}
            brand={adminBrand}
            onOrganizationChange={handleAdminOrgChange}
            onBrandChange={handleAdminBrandChange}
          />
        </div>
      )}

      <AppTable<ElementMood>
        items={moods}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No moods found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyModalMood
          item={selectedMood}
          onClose={() => setSelectedMood(null)}
          onConfirm={() => {
            setSelectedMood(null);
            findAllMoods(true);
          }}
        />
      )}

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="moods" />
      </div>
    </>
  );
}
