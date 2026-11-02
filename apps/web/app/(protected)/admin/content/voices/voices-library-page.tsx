'use client';

import type { VoiceProvider } from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IPagedItems } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import type { ExternalVoice } from '@models/elements/external-voice.model';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { VoicesService } from '@services/ingredients/voices.service';
import { useQueryClient } from '@tanstack/react-query';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Volume2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ProviderFilter,
  VoiceCatalogToggleField,
} from '@/features/admin/props/voices.props';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';
import {
  VoicesCatalogSearch,
  VoicesSyncAllButton,
  VoicesSyncMenu,
} from './voices-catalog-controls';
import VoicesCatalogTable from './voices-catalog-table';

const VOICE_SORT_KEYS = [
  'name',
  'provider',
  'externalVoiceId',
  'language',
  'status',
] as const;

const EMPTY_VOICES: ExternalVoice[] = [];
const VOICES_CATALOG_KEY = ['admin', 'voices-catalog'] as const;

function VoicesLibraryPageContent() {
  const t = useTranslations('pages.adminVoices');
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const currentPage = Number(searchParams.get('page')) || 1;
  const search = searchParams.get('q') ?? '';
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: VOICE_SORT_KEYS,
  });
  const providerFilter = (searchParams.get('provider') ??
    'all') as ProviderFilter;
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const getVoicesService = useAuthedService((token: string) =>
    VoicesService.getInstance(token),
  );

  const queryClient = useQueryClient();
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingProvider, setSyncingProvider] = useState<VoiceProvider | null>(
    null,
  );
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

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

  // Cached per page, provider, search and sort: coming back to the Voice
  // Library paints the rows it already has while it refreshes, and paging keeps
  // the current rows on screen.
  const catalogQuery = usePagedAuthedQuery({
    keepPreviousDataWithin: VOICES_CATALOG_KEY,
    queryFn: async (service, signal) => {
      try {
        const result = await service.findCatalog(
          {
            limit: ITEMS_PER_PAGE,
            page: currentPage,
            provider: providerFilter === 'all' ? undefined : providerFilter,
            search: search.trim() || undefined,
            sort,
          },
          signal,
        );
        return result;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /voices/catalog failed', error);
        }
        throw error;
      }
    },
    queryKey: [
      ...VOICES_CATALOG_KEY,
      { page: currentPage, providerFilter, search: search.trim(), sort },
    ],
    service: (token: string) => VoicesService.getInstance(token),
  });
  const {
    errorUpdatedAt,
    isError: hasError,
    isFetching: isRefreshing,
    isLoading,
    refetch,
  } = catalogQuery;
  const voices = hasError
    ? EMPTY_VOICES
    : (catalogQuery.data?.items ?? EMPTY_VOICES);
  const loadVoices = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // One toast per failed read, after its retry, not one per attempt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (hasError) {
      notifications.error('Failed to load voice catalog');
    }
  }, [errorUpdatedAt, hasError, notifications]);

  const handleSync = useCallback(
    async (providers?: VoiceProvider[]) => {
      const provider = providers?.length === 1 ? providers[0] : null;
      if (provider) {
        setSyncingProvider(provider);
      } else {
        setIsSyncingAll(true);
      }

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
        setSyncingProvider(null);
        setIsSyncingAll(false);
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
      setTogglingKey(`${voice.id}:${field}`);

      try {
        const service = await getVoicesService();
        const updatedVoice = await service.patchCatalogVoice(voice.id, {
          [field]: value,
        });

        // Every cached page that lists this voice shows the change at once.
        queryClient.setQueriesData<IPagedItems<ExternalVoice>>(
          { queryKey: VOICES_CATALOG_KEY },
          (current) =>
            current && {
              ...current,
              items: current.items.map((item) =>
                item.id === updatedVoice.id ? updatedVoice : item,
              ),
            },
        );
      } catch (error) {
        logger.error(`PATCH /voices/catalog/${voice.id} failed`, error);
        notifications.error('Failed to update voice');
      } finally {
        setTogglingKey(null);
      }
    },
    [getVoicesService, notifications, queryClient],
  );

  return (
    <AdminPageShell
      title="Voice Library"
      icon={Volume2}
      onRefresh={() => void loadVoices()}
      isRefreshing={isRefreshing}
      search={
        <VoicesCatalogSearch
          search={search}
          onSearchChange={(value) => setParam('q', value.trim())}
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
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={onSortChange}
          onToggle={handleToggle}
        />
        {hasError || voices.length === 0 ? null : (
          <AutoPagination
            totals={catalogQuery.data?.totals ?? EMPTY_PAGE_TOTALS}
          />
        )}
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
