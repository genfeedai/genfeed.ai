import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { PageScope } from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IQueryParams, ISound } from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Sound } from '@models/ingredients/sound.model';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SoundsService } from '@services/elements/sounds.service';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import { normalizeElementKey } from '@ui/display/element-scope-badge/element-row-sidebar';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useReducer, useRef } from 'react';
import { useAdminOrgBrandParams } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import type {
  SoundFetchStatus as FetchStatus,
  SoundsListAction,
  SoundsListState,
} from '@/features/admin/props/sounds.props';
import { useInlineRecordSave } from '@/hooks/ui/use-inline-record-save/use-inline-record-save';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

import { buildSoundsColumns } from './sounds-list-columns.helpers';
import SoundsListModals from './sounds-list-modals';

function soundsListReducer(
  state: SoundsListState,
  action: SoundsListAction,
): SoundsListState {
  switch (action.type) {
    case 'FETCH_START':
      return {
        ...state,
        fetchStatus: action.isRefresh ? 'refreshing' : 'loading',
      };
    case 'FETCH_SUCCESS':
      return { ...state, page: action.page };
    case 'FETCH_FINALLY':
      return { ...state, fetchStatus: 'idle' };
    case 'ADD_UPDATING_ID': {
      const next = new Set(state.updatingIds);
      next.add(action.id);
      return { ...state, updatingIds: next };
    }
    case 'REMOVE_UPDATING_ID': {
      const next = new Set(state.updatingIds);
      next.delete(action.id);
      return { ...state, updatingIds: next };
    }
    default:
      return state;
  }
}

const EMPTY_SOUNDS: Sound[] = [];

const SOUND_SORT_KEYS = ['label', 'key', 'sortOrder'];

function SoundsListContent({
  filters,
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps) {
  const notificationsService = NotificationsService.getInstance();
  const rowSidebarT = useTranslations('ui.rowSidebar');
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const { openConfirm } = useConfirmModal();

  const getSoundsService = useAuthedService(
    useCallback((token: string) => SoundsService.getInstance(token), []),
  );

  const searchParams = useSearchParams();
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: SOUND_SORT_KEYS,
  });

  const [state, dispatch] = useReducer(soundsListReducer, undefined, () => ({
    page: null,
    fetchStatus: 'loading' as FetchStatus,
    updatingIds: new Set<string>(),
  }));

  const { page, fetchStatus, updatingIds } = state;
  const sounds = page?.items ?? EMPTY_SOUNDS;

  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  // Derive isLoading from fetchStatus instead of storing it in separate state
  const isLoading = fetchStatus === 'loading';

  // Use refs for callback props to prevent unnecessary re-renders
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;

  // Only the latest request may fill the list, so a slow response for an
  // earlier sort or search cannot replace the current one.
  const latestRequestRef = useRef(0);

  const findAllSounds = useCallback(
    async (isRefresh = false) => {
      const requestId = ++latestRequestRef.current;
      dispatch({ type: 'FETCH_START', isRefresh });

      // Notify parent of state changes
      onRefreshingChangeRef.current?.(isRefresh);
      onLoadingChangeRef.current?.(!isRefresh);

      try {
        const service = await getSoundsService();

        // Build API query
        const query: IQueryParams = {
          limit: ITEMS_PER_PAGE,
          page: currentPage,
          search: filters?.search || undefined,
          ...(sort ? { sort } : {}),
          type: filters?.type || undefined,
        };

        if (scope === PageScope.SUPERADMIN) {
          if (adminOrg) {
            query.organization = adminOrg;
          }
          if (adminBrand) {
            query.brand = adminBrand;
          }
        }

        const data = await service.findAllPage(query);
        if (requestId !== latestRequestRef.current) {
          return;
        }
        dispatch({ type: 'FETCH_SUCCESS', page: data });

        logger.info('GET /sounds success', data.items);
      } catch (error) {
        if (requestId !== latestRequestRef.current) {
          return;
        }
        logger.error('GET /sounds failed', error);
        notificationsService.error('Failed to load sounds');
      } finally {
        if (requestId === latestRequestRef.current) {
          dispatch({ type: 'FETCH_FINALLY' });
          onLoadingChangeRef.current?.(false);
          onRefreshingChangeRef.current?.(false);
        }
      }
    },
    [
      currentPage,
      filters?.search,
      sort,
      filters?.type,
      getSoundsService,
      notificationsService.error,
      scope,
      adminOrg,
      adminBrand,
    ],
  );

  // Fetch data on mount and when search params change
  useEffect(() => {
    findAllSounds();
  }, [findAllSounds]);

  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => findAllSounds(true));
    }
  }, [onRefresh, findAllSounds]);

  const handleToggleActive = async (sound: Sound) => {
    dispatch({ type: 'ADD_UPDATING_ID', id: sound.id });
    try {
      const service = await getSoundsService();
      await service.patch(sound.id, { isActive: !sound.isActive });
      notificationsService.success('Sound updated');
      findAllSounds(true);
    } catch (error) {
      logger.error('Failed to update sound', error);
      notificationsService.error('Failed to update sound');
    } finally {
      dispatch({ type: 'REMOVE_UPDATING_ID', id: sound.id });
    }
  };

  const handleToggleDefault = async (sound: Sound) => {
    dispatch({ type: 'ADD_UPDATING_ID', id: sound.id });
    try {
      const service = await getSoundsService();
      await service.patch(sound.id, { isDefault: !sound.isDefault });
      notificationsService.success('Sound updated');
      findAllSounds(true);
    } catch (error) {
      logger.error('Failed to update sound', error);
      notificationsService.error('Failed to update sound');
    } finally {
      dispatch({ type: 'REMOVE_UPDATING_ID', id: sound.id });
    }
  };

  const handleDelete = async (sound: Sound) => {
    try {
      const service = await getSoundsService();
      await service.delete(sound.id);
      notificationsService.success('Sound deleted');
      findAllSounds(true);
    } catch (error) {
      logger.error('Failed to delete sound', error);
      notificationsService.error('Failed to delete sound');
    }
  };

  const scopeTranslate = useTranslations('ui.elementPlatformFields');
  const columns = buildSoundsColumns({
    updatingIds,
    scope,
    onToggleActive: handleToggleActive,
    onToggleDefault: handleToggleDefault,
    scopeLabel: scopeTranslate('scopeHeader'),
    sortOrderLabel: scopeTranslate('sortOrderLabel'),
  });

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <Trash2 />,
            onClick: (sound: Sound) => {
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Sound',
                message: `Are you sure you want to delete "${sound.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(sound),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

  const saveSound = useInlineRecordSave<Partial<Sound> & { key?: string }>({
    errorMessage: 'Failed to update sound',
    onSaved: () => findAllSounds(true),
    save: async (id, patch) => (await getSoundsService()).patch(id, patch),
  });

  const isEditable = scope === PageScope.SUPERADMIN;

  const rowSidebar = createSummaryRowSidebar<Sound>({
    getBadges: (sound) => (
      <ElementScopeBadge
        isActive={sound.isActive}
        isPlatformDefault={sound.isPlatformDefault}
      />
    ),
    getFacts: (sound) => [
      {
        editor: isEditable
          ? {
              ariaLabel: fieldsT('label'),
              isRequired: true,
              kind: 'text',
              onSave: (label) => saveSound(sound.id, { label }),
              value: sound.label,
            }
          : undefined,
        id: 'label',
        label: fieldsT('label'),
        value: sound.label,
      },
      {
        editor: isEditable
          ? {
              ariaLabel: fieldsT('key'),
              isRequired: true,
              kind: 'text',
              onSave: (key) =>
                saveSound(sound.id, { key: normalizeElementKey(key) }),
              value: (sound as ISound).key,
            }
          : undefined,
        id: 'key',
        label: fieldsT('key'),
        value: (sound as ISound).key,
      },
      {
        editor: isEditable
          ? {
              ariaLabel: fieldsT('description'),
              isMultiline: true,
              kind: 'text',
              onSave: (description) => saveSound(sound.id, { description }),
              placeholder: '-',
              value: sound.description,
            }
          : undefined,
        id: 'description',
        label: fieldsT('description'),
        value: sound.description,
      },
      { id: 'category', label: fieldsT('category'), value: sound.category },
      {
        editor: isEditable
          ? {
              ariaLabel: fieldsT('sortOrder'),
              kind: 'number',
              onSave: (sortOrder) => saveSound(sound.id, { sortOrder }),
              value: sound.sortOrder ?? 0,
            }
          : undefined,
        id: 'sortOrder',
        label: fieldsT('sortOrder'),
        value: sound.sortOrder ?? 0,
      },
      {
        editor: isEditable
          ? {
              ariaLabel: fieldsT('default'),
              isChecked: sound.isDefault === true,
              kind: 'switch',
              onSave: (isDefault) => saveSound(sound.id, { isDefault }),
            }
          : undefined,
        id: 'default',
        label: fieldsT('default'),
        value: sound.isDefault ? rowSidebarT('yes') : rowSidebarT('no'),
      },
    ],
    getId: (sound) => sound.id,
    getSubtitle: (sound) => (sound as ISound).key,
    getTitle: (sound) => sound.label ?? (sound as ISound).key ?? sound.id,
    kind: 'record',
  });

  return (
    <>
      <AppTable<Sound>
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        items={sounds}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No sounds found"
      />

      <SoundsListModals
        scope={scope}
        onConfirm={() => {
          findAllSounds(true);
        }}
      />

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel="sounds"
          totals={
            page
              ? { totalDocs: page.total, totalPages: page.totalPages }
              : EMPTY_PAGE_TOTALS
          }
        />
      </div>
    </>
  );
}

export default function SoundsList(
  props: Parameters<typeof SoundsListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <SoundsListContent {...props} />
    </Suspense>
  );
}
