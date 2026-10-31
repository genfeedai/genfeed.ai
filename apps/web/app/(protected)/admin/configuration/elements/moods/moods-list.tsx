import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
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
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { MoodsService } from '@services/elements/moods.service';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import { useElementRowSidebar } from '@ui/display/element-scope-badge/element-row-sidebar';
import AppTable from '@ui/display/table/Table';
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
import { useAdminOrgBrandParams } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import { LazyModalMood } from '@/components/lazy/modal/LazyModal';
import type {
  MoodsListAction,
  MoodsListState,
} from '@/features/admin/props/moods.props';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

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

const MOOD_SORT_KEYS = ['label', 'key'];

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
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: MOOD_SORT_KEYS,
  });
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
      sortable: true,
      subtext: (mood: ElementMood) => mood.description,
    },
    {
      className: 'font-mono text-sm',
      header: 'Key',
      key: 'key',
      sortable: true,
    },
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

  // Only the latest request may fill the list, so a slow response for an
  // earlier sort or search cannot replace the current one.
  const latestRequestRef = useRef(0);

  const findAllMoods = useCallback(
    async (isRefreshRequest = false) => {
      const requestId = ++latestRequestRef.current;
      dispatch({ type: 'SET_IS_LOADING', payload: !isRefreshRequest });
      onRefreshingChangeRef.current?.(isRefreshRequest);
      onLoadingChangeRef.current?.(!isRefreshRequest);

      try {
        const service = await getMoodsService();
        const query: IQueryParams = {
          limit: ITEMS_PER_PAGE,
          page: currentPage,
          search: filters?.search || undefined,
          ...(sort ? { sort } : {}),
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
        if (requestId !== latestRequestRef.current) {
          return;
        }
        dispatch({ type: 'SET_MOODS', payload: data });
        logger.info('GET /moods success', data);
      } catch (error) {
        if (requestId !== latestRequestRef.current) {
          return;
        }
        logger.error('GET /moods failed', error);
        notificationsService.error('Failed to load moods');
      } finally {
        if (requestId === latestRequestRef.current) {
          dispatch({ type: 'SET_IS_LOADING', payload: false });
          onLoadingChangeRef.current?.(false);
          onRefreshingChangeRef.current?.(false);
        }
      }
    },
    [
      currentPage,
      filters?.search,
      sort,
      getMoodsService,
      notificationsService.error,
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

  const rowSidebar = useElementRowSidebar<ElementMood>({
    onEdit:
      scope === PageScope.SUPERADMIN
        ? (element) => openMoodModal(ModalEnum.MOOD, element)
        : undefined,
  });

  return (
    <>
      <AppTable<ElementMood>
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        items={moods}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
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
