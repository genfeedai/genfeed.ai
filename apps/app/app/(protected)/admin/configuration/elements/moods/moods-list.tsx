import { ModalEnum, PageScope } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type {
  IElementMood,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementMood } from '@models/elements/mood.model';
import type { MoodsListAction, MoodsListState } from '@props/admin/moods.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { MoodsService } from '@services/elements/moods.service';
import { useAdminOrgBrandParams } from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import AppTable from '@ui/display/table/Table';
import { LazyModalMood } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Pencil, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from 'react';

function moodsListReducer(
  state: MoodsListState,
  action: MoodsListAction,
): MoodsListState {
  switch (action.type) {
    case 'SET_MOODS':
      return { ...state, moods: action.payload };
    case 'SET_IS_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_SELECTED_MOOD':
      return { ...state, selectedMood: action.payload };
  }
}

function MoodsListContent({
  filters,
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps): ReactNode {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;

  const [state, dispatch] = useReducer(moodsListReducer, undefined, () => ({
    moods: [],
    isLoading: true,
    selectedMood: null,
  }));

  const { moods, isLoading, selectedMood } = state;
  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  const getMoodsService = useAuthedService(
    useCallback((token: string) => MoodsService.getInstance(token), []),
  );

  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  const scopeTranslate = useTranslations('ui.elementPlatformFields');
  const columns: TableColumn<ElementMood>[] = [
    {
      header: 'Label',
      key: 'label',
      subtext: (mood: ElementMood) => mood.description,
    },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: scopeTranslate('scopeHeader'),
      key: 'isPlatformDefault',
      render: (element: ElementMood) => (
        <ElementScopeBadge
          isActive={element.isActive}
          isPlatformDefault={element.isPlatformDefault}
        />
      ),
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
          search: filters?.search || undefined,
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
      filters?.search,
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
            icon: <Pencil />,
            onClick: (mood: ElementMood) => openMoodModal(ModalEnum.MOOD, mood),
            tooltip: 'Edit',
          },
          {
            icon: <Trash2 />,
            onClick: handleConfirmDelete,
            tooltip: 'Delete',
          },
        ]
      : [];

  return (
    <>
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
