'use client';

import {
  AlertCategory,
  ButtonVariant,
  ViewType,
  type VoiceProvider,
} from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionViewPreference } from '@hooks/utils/use-collection-view-preference/use-collection-view-preference';
import type { ExternalVoice } from '@models/elements/external-voice.model';
import type {
  VoicesLibraryAction,
  VoicesLibraryState,
} from '@props/admin/voices.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { VoicesService } from '@services/ingredients/voices.service';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import CollectionView from '@ui/collection/CollectionView';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

import VoiceCatalogCard from './voice-catalog-card';
import VoicesCatalogControls from './voices-catalog-controls';

const initialState: VoicesLibraryState = {
  voices: [],
  isLoading: true,
  isSyncingAll: false,
  syncingProvider: null,
  search: '',
  providerFilter: 'all',
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
    case 'SET_SEARCH':
      return { ...state, search: action.search };
    case 'SET_PROVIDER_FILTER':
      return { ...state, providerFilter: action.providerFilter };
    default:
      return state;
  }
}

export default function VoicesLibraryPage() {
  const t = useTranslations('pages.adminVoices');
  const { view, setView } = useCollectionViewPreference({
    surface: 'admin.library.voices',
    defaultView: ViewType.LIST,
  });
  const [hasError, setHasError] = useState(false);
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const getVoicesService = useAuthedService((token: string) =>
    VoicesService.getInstance(token),
  );

  const [state, dispatch] = useReducer(voicesLibraryReducer, initialState);
  const {
    voices,
    isLoading,
    isSyncingAll,
    syncingProvider,
    search,
    providerFilter,
    togglingKey,
  } = state;

  const loadVoices = useCallback(async () => {
    dispatch({ type: 'LOAD_START' });
    setHasError(false);

    try {
      const service = await getVoicesService();
      const data = await service.findCatalog({
        provider: providerFilter === 'all' ? undefined : providerFilter,
        search: search.trim() || undefined,
      });
      dispatch({ type: 'LOAD_SUCCESS', voices: data });
    } catch (error) {
      logger.error('GET /voices/catalog failed', error);
      notifications.error('Failed to load voice catalog');
      setHasError(true);
      dispatch({ type: 'LOAD_ERROR' });
    }
  }, [getVoicesService, notifications, providerFilter, search]);

  useEffect(() => {
    loadVoices().catch((error) => {
      logger.error('Failed to initialize voice library page', error);
    });
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
      field: 'isActive' | 'isDefaultSelectable' | 'isFeatured',
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
    <Container
      description="Superadmin catalog for importing and curating DB-backed provider voices."
      icon={Volume2}
      label="Voice Library"
    >
      <VoicesCatalogControls
        view={view}
        onViewChange={setView}
        isSyncingAll={isSyncingAll}
        providerFilter={providerFilter}
        search={search}
        syncingProvider={syncingProvider}
        onProviderFilterChange={(pf) =>
          dispatch({ type: 'SET_PROVIDER_FILTER', providerFilter: pf })
        }
        onSearchChange={(s) => dispatch({ type: 'SET_SEARCH', search: s })}
        onSync={handleSync}
      />

      <WorkspaceSurface
        className="mt-6"
        title="Catalog Voices"
        tone="muted"
        data-testid="voices-library-results-surface"
      >
        {hasError ? (
          <Alert type={AlertCategory.ERROR}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{t('loadError')}</span>
              <Button
                label={t('retry')}
                onClick={loadVoices}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          </Alert>
        ) : (
          <CollectionView
            data-testid={view === ViewType.LIST ? 'voices-list' : 'voices-grid'}
            view={view}
            items={voices}
            isLoading={isLoading}
            maxColumns={3}
            getItemKey={(voice) => voice.id}
            emptyState={<CardEmptyContent label={t('empty')} />}
            renderListItem={(voice) => (
              <VoiceCatalogCard
                isList
                togglingKey={togglingKey}
                voice={voice}
                onToggle={handleToggle}
              />
            )}
            renderGridItem={(voice) => (
              <VoiceCatalogCard
                togglingKey={togglingKey}
                voice={voice}
                onToggle={handleToggle}
              />
            )}
          />
        )}
      </WorkspaceSurface>
    </Container>
  );
}
