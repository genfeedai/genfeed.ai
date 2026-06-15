'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModalEnum, PageScope } from '@genfeedai/enums';
import type { IQueryParams } from '@genfeedai/interfaces';
import type { IElementContentProps } from '@genfeedai/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Sound } from '@models/ingredients/sound.model';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SoundsService } from '@services/elements/sounds.service';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';
import { buildSoundsColumns } from './sounds-list-columns.helpers';
import SoundsListModals from './sounds-list-modals';

type FetchStatus = 'loading' | 'refreshing' | 'idle';

type SoundsListState = {
  sounds: Sound[];
  fetchStatus: FetchStatus;
  updatingIds: Set<string>;
  selectedSound: Sound | null;
  adminOrg: string;
  adminBrand: string;
};

type SoundsListAction =
  | { type: 'FETCH_START'; isRefresh: boolean }
  | { type: 'FETCH_SUCCESS'; sounds: Sound[]; isRefresh: boolean }
  | { type: 'FETCH_FINALLY' }
  | { type: 'ADD_UPDATING_ID'; id: string }
  | { type: 'REMOVE_UPDATING_ID'; id: string }
  | { type: 'SET_SELECTED_SOUND'; sound: Sound | null }
  | { type: 'SET_ADMIN_ORG'; orgId: string }
  | { type: 'SET_ADMIN_BRAND'; brandId: string };

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
      return { ...state, sounds: action.sounds };
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
    case 'SET_SELECTED_SOUND':
      return { ...state, selectedSound: action.sound };
    case 'SET_ADMIN_ORG':
      return { ...state, adminOrg: action.orgId, adminBrand: '' };
    case 'SET_ADMIN_BRAND':
      return { ...state, adminBrand: action.brandId };
    default:
      return state;
  }
}

function SoundsListContent({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
}: IElementContentProps) {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const getSoundsService = useAuthedService(
    useCallback((token: string) => SoundsService.getInstance(token), []),
  );

  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

  const [state, dispatch] = useReducer(soundsListReducer, undefined, () => ({
    sounds: [],
    fetchStatus: 'loading' as FetchStatus,
    updatingIds: new Set<string>(),
    selectedSound: null,
    adminOrg: parsedSearchParams.get('organization') || '',
    adminBrand: parsedSearchParams.get('brand') || '',
  }));

  const {
    sounds,
    fetchStatus,
    updatingIds,
    selectedSound,
    adminOrg,
    adminBrand,
  } = state;

  // Derive isLoading from fetchStatus instead of storing it in separate state
  const isLoading = fetchStatus === 'loading';

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
      dispatch({ type: 'SET_ADMIN_ORG', orgId });
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
      dispatch({ type: 'SET_ADMIN_BRAND', brandId });
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

  // Use refs for callback props to prevent unnecessary re-renders
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;

  const findAllSounds = useCallback(
    async (isRefresh = false) => {
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
        dispatch({ type: 'FETCH_SUCCESS', sounds: data, isRefresh });

        if (isRefresh) {
          notificationsService.success('Sounds refreshed');
        }

        logger.info('GET /sounds success', data);
      } catch (error) {
        logger.error('GET /sounds failed', error);
        notificationsService.error('Failed to load sounds');
      } finally {
        dispatch({ type: 'FETCH_FINALLY' });
        onLoadingChangeRef.current?.(false);
        onRefreshingChangeRef.current?.(false);
      }
    },
    [
      currentPage,
      getSoundsService,
      notificationsService.error,
      notificationsService.success,
      scope,
      adminOrg,
      adminBrand,
    ],
  );

  // Fetch data on mount and when search params change
  useEffect(() => {
    findAllSounds();
  }, [findAllSounds]);
  const openSoundModal = (modalId: ModalEnum, sound?: Sound) => {
    dispatch({ type: 'SET_SELECTED_SOUND', sound: sound || null });
    openModal(modalId);
  };

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
      dispatch({ type: 'SET_SELECTED_SOUND', sound: null });
      findAllSounds(true);
    } catch (error) {
      logger.error('Failed to delete sound', error);
      notificationsService.error('Failed to delete sound');
      dispatch({ type: 'SET_SELECTED_SOUND', sound: null });
    }
  };

  const columns = buildSoundsColumns({
    updatingIds,
    scope,
    onToggleActive: handleToggleActive,
    onToggleDefault: handleToggleDefault,
  });

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <HiPencil />,
            onClick: (sound: Sound) => openSoundModal(ModalEnum.SOUND, sound),
            tooltip: 'Edit',
          },
          {
            icon: <HiTrash />,
            onClick: (sound: Sound) => {
              dispatch({ type: 'SET_SELECTED_SOUND', sound });
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

      <AppTable<Sound>
        items={sounds}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No sounds found"
      />

      <SoundsListModals
        scope={scope}
        selectedSound={selectedSound}
        onConfirm={() => {
          dispatch({ type: 'SET_SELECTED_SOUND', sound: null });
          findAllSounds(true);
        }}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="sounds" />
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
