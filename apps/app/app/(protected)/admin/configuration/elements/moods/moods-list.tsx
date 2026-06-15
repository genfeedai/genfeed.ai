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
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';

type MoodsListState = {
  adminOrg: string;
  adminBrand: string;
  moods: ElementMood[];
  isLoading: boolean;
  selectedMood: IElementMood | null;
};

type MoodsListAction =
  | { type: 'SET_ADMIN_BRAND'; payload: string }
  | { type: 'SET_ADMIN_ORG_CLEAR_BRAND'; payload: string }
  | { type: 'SET_MOODS'; payload: ElementMood[] }
  | { type: 'SET_IS_LOADING'; payload: boolean }
  | { type: 'SET_SELECTED_MOOD'; payload: IElementMood | null };

function moodsListReducer(
  state: MoodsListState,
  action: MoodsListAction,
): MoodsListState {
  switch (action.type) {
    case 'SET_ADMIN_BRAND':
      return { ...state, adminBrand: action.payload };
    case 'SET_ADMIN_ORG_CLEAR_BRAND':
      return { ...state, adminOrg: action.payload, adminBrand: '' };
    case 'SET_MOODS':
      return { ...state, moods: action.payload };
    case 'SET_IS_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_SELECTED_MOOD':
      return { ...state, selectedMood: action.payload };
  }
}

function MoodsListContent({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps): ReactNode {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const currentPage = Number(searchParams.get('page')) || 1;

  const [state, dispatch] = useReducer(moodsListReducer, undefined, () => ({
    adminOrg: parsedSearchParams.get('organization') || '',
    adminBrand: parsedSearchParams.get('brand') || '',
    moods: [],
    isLoading: true,
    selectedMood: null,
  }));

  const { adminOrg, adminBrand, moods, isLoading, selectedMood } = state;

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
      dispatch({ type: 'SET_ADMIN_ORG_CLEAR_BRAND', payload: orgId });
      const params = new URLSearchParams(searchParamsString);
      if (orgId) {
        params.set('organization', orgId);
      } else {
        params.delete('organization');
      }
      params.delete('brand');
      params.delete('page');
      const queryString = params.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  const handleAdminBrandChange = useCallback(
    (brandId: string) => {
      dispatch({ type: 'SET_ADMIN_BRAND', payload: brandId });
      const params = new URLSearchParams(searchParamsString);
      if (brandId) {
        params.set('brand', brandId);
      } else {
        params.delete('brand');
      }
      params.delete('page');
      const queryString = params.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  const getMoodsService = useAuthedService(
    useCallback((token: string) => MoodsService.getInstance(token), []),
  );

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
      dispatch({ type: 'SET_IS_LOADING', payload: !isRefreshRequest });
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
        dispatch({ type: 'SET_MOODS', payload: data });
        logger.info('GET /moods success', data);

        if (isRefreshRequest) {
          notificationsService.success('Moods refreshed');
        }
      } catch (error) {
        logger.error('GET /moods failed', error);
        notificationsService.error('Failed to load moods');
      } finally {
        dispatch({ type: 'SET_IS_LOADING', payload: false });
        onLoadingChangeRef.current?.(false);
        onRefreshingChangeRef.current?.(false);
      }
    },
    [
      currentPage,
      getMoodsService,
      notificationsService.error,
      notificationsService.success,
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
    dispatch({ type: 'SET_SELECTED_MOOD', payload: mood ?? null });
    openModal(modalId);
  }

  async function handleDelete(mood: IElementMood | null): Promise<void> {
    if (!mood) {
      return;
    }

    try {
      const service = await getMoodsService();
      await service.delete(mood.id);
      notificationsService.success('Mood deleted');
      dispatch({ type: 'SET_SELECTED_MOOD', payload: null });
      findAllMoods(true);
    } catch (error) {
      logger.error('Failed to delete mood', error);
      notificationsService.error('Failed to delete mood');
      dispatch({ type: 'SET_SELECTED_MOOD', payload: null });
    }
  }

  function handleConfirmDelete(mood: ElementMood): void {
    dispatch({ type: 'SET_SELECTED_MOOD', payload: mood });
    openConfirm({
      confirmLabel: 'Delete',
      isError: true,
      label: 'Delete Mood',
      message: `Are you sure you want to delete "${mood.label}"? This action cannot be undone.`,
      onConfirm: () => handleDelete(mood),
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
          onClose={() => dispatch({ type: 'SET_SELECTED_MOOD', payload: null })}
          onConfirm={() => {
            dispatch({ type: 'SET_SELECTED_MOOD', payload: null });
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
export default function MoodsList(
  props: Parameters<typeof MoodsListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <MoodsListContent {...props} />
    </Suspense>
  );
}
