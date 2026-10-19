'use client';

import type { VoiceProvider } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ExternalVoice } from '@models/elements/external-voice.model';
import type {
  ProviderFilter,
  VoiceCatalogToggleField,
  VoicesLibraryAction,
  VoicesLibraryState,
} from '@props/admin/voices.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { VoicesService } from '@services/ingredients/voices.service';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Volume2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';

import {
  VoicesCatalogFilters,
  VoicesCatalogSearch,
  VoicesSyncAllButton,
  VoicesSyncMenu,
} from './voices-catalog-controls';
import VoicesCatalogTable from './voices-catalog-table';

const initialState: VoicesLibraryState = {
  voices: [],
  isLoading: true,
  isSyncingAll: false,
  syncingProvider: null,
  togglingKey: null,
};

function voicesLibraryReducer(
  state: VoicesLibraryState,
  action: VoicesLibraryAction,
): VoicesLibraryState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, isLoading: true };
    case 'LOAD_SUCCESS':
      return { ...state, isLoading: false, voices: action.voices };
    case 'LOAD_ERROR':
      return { ...state, isLoading: false, voices: [] };
    case 'SYNC_START':
      return action.provider
        ? { ...state, syncingProvider: action.provider }
        : { ...state, isSyncingAll: true };
    case 'SYNC_END':
      return { ...state, syncingProvider: null, isSyncingAll: false };
    case 'TOGGLE_START':
      return { ...state, togglingKey: action.key };
    case 'TOGGLE_SUCCESS':
      return {
        ...state,
        voices: state.voices.map((item) =>
          item.id === action.voice.id ? action.voice : item,
        ),
      };
    case 'TOGGLE_END':
      return { ...state, togglingKey: null };
    default:
      return state;
  }
}

function VoicesLibraryPageContent() {
  const t = useTranslations('pages.adminVoices');
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const currentPage = Number(searchParams.get('page')) || 1;
  const search = searchParams.get('q') ?? '';
  const providerFilter = (searchParams.get('provider') ??
    'all') as ProviderFilter;
  const [hasError, setHasError] = useState(false);
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const getVoicesService = useAuthedService((token: string) =>
    VoicesService.getInstance(token),
  );

  const [state, dispatch] = useReducer(voicesLibraryReducer, initialState);
  const { voices, isLoading, isSyncingAll, syncingProvider, togglingKey } =
    state;

  const setParam = useCallback(
    (name: string, value: string) => {
      const next = new URLSearchParams(searchParamsString);
      if (value) next.set(name, value);
      else next.delete(name);
      next.delete('page');
      const query = next.toString();
      replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, replace, searchParamsString],
  );

  const loadVoices = useCallback(
    async (signal?: AbortSignal) => {
      dispatch({ type: 'LOAD_START' });
      setHasError(false);

      try {
        const service = await getVoicesService();
        const result = await service.findCatalog(
          {
            limit: ITEMS_PER_PAGE,
            page: currentPage,
            provider: providerFilter === 'all' ? undefined : providerFilter,
            search: search.trim() || undefined,
          },
          signal,
        );
        if (signal?.aborted) return;
        dispatch({ type: 'LOAD_SUCCESS', voices: result.items });
      } catch (error) {
        if (signal?.aborted) return;
        logger.error('GET /voices/catalog failed', error);
        notifications.error('Failed to load voice catalog');
        setHasError(true);
        dispatch({ type: 'LOAD_ERROR' });
      }
    },
    [currentPage, getVoicesService, notifications, providerFilter, search],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadVoices(controller.signal).catch((error) => {
      logger.error('Failed to initialize voice library page', error);
    });
    return () => controller.abort();
  }, [loadVoices]);

  const handleSync = useCallback(
    async (providers?: VoiceProvider[]) => {
      const provider = providers?.length === 1 ? providers[0] : null;
      dispatch({ type: 'SYNC_START', provider });

      try {
        const service = await getVoicesService();
        const result = await service.importCatalogVoices(providers);
        notifications.success(
          `Voice catalog synced — ${result.created} created, ${result.updated} updated`,
        );
        await loadVoices();
      } catch (error) {
        logger.error('POST /voices/import failed', error);
        notifications.error('Failed to sync voice catalog');
      } finally {
        dispatch({ type: 'SYNC_END' });
      }
    },
    [getVoicesService, loadVoices, notifications],
  );

  const handleToggle = useCallback(
    async (
      voice: ExternalVoice,
      field: VoiceCatalogToggleField,
      value: boolean,
    ) => {
      dispatch({ type: 'TOGGLE_START', key: `${voice.id}:${field}` });

      try {
        const service = await getVoicesService();
        const updatedVoice = await service.patchCatalogVoice(voice.id, {
          [field]: value,
        });

        dispatch({ type: 'TOGGLE_SUCCESS', voice: updatedVoice });
      } catch (error) {
        logger.error(`PATCH /voices/catalog/${voice.id} failed`, error);
        notifications.error('Failed to update voice');
      } finally {
        dispatch({ type: 'TOGGLE_END' });
      }
    },
    [getVoicesService, notifications],
  );

  return (
    <AdminPageShell
      title="Voice Library"
      icon={Volume2}
      onRefresh={() => void loadVoices()}
      isRefreshing={isLoading}
      search={
        <VoicesCatalogSearch
          search={search}
          onSearchChange={(value) => setParam('q', value.trim())}
        />
      }
      filters={
        <VoicesCatalogFilters
          providerFilter={providerFilter}
          onProviderFilterChange={(value) =>
            setParam('provider', value === 'all' ? '' : value)
          }
        />
      }
      dropdowns={
        <VoicesSyncMenu
          isSyncingAll={isSyncingAll}
          syncingProvider={syncingProvider}
          onSync={handleSync}
        />
      }
      primaryAction={
        <VoicesSyncAllButton
          isSyncingAll={isSyncingAll}
          syncingProvider={syncingProvider}
          onSync={handleSync}
        />
      }
    >
      <div className="grid gap-3" data-testid="voices-list">
        <VoicesCatalogTable
          error={
            hasError
              ? {
                  onRetry: () => void loadVoices(),
                  title: t('loadError'),
                }
              : undefined
          }
          isLoading={isLoading}
          togglingKey={togglingKey}
          voices={voices}
          onToggle={handleToggle}
        />
        {hasError || voices.length === 0 ? null : <AutoPagination />}
      </div>
    </AdminPageShell>
  );
}

export default function VoicesLibraryPage() {
  return (
    <Suspense fallback={null}>
      <VoicesLibraryPageContent />
    </Suspense>
  );
}
