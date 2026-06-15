'use client';

import type { VoiceProvider } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Voice } from '@models/ingredients/voice.model';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { VoicesService } from '@services/ingredients/voices.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { HiOutlineSpeakerWave } from 'react-icons/hi2';
import VoiceCatalogCard from './voice-catalog-card';
import VoicesCatalogControls, {
  type ProviderFilter,
} from './voices-catalog-controls';

const VOICE_SKELETON_KEYS = [
  'voice-skeleton-1',
  'voice-skeleton-2',
  'voice-skeleton-3',
  'voice-skeleton-4',
  'voice-skeleton-5',
  'voice-skeleton-6',
] as const;

type VoicesLibraryState = {
  voices: Voice[];
  isLoading: boolean;
  isSyncingAll: boolean;
  syncingProvider: VoiceProvider | null;
  search: string;
  providerFilter: ProviderFilter;
  togglingKey: string | null;
};

type VoicesLibraryAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; voices: Voice[] }
  | { type: 'LOAD_ERROR' }
  | { type: 'SYNC_START'; provider: VoiceProvider | null }
  | { type: 'SYNC_SUCCESS'; voices: Voice[] }
  | { type: 'SYNC_END' }
  | { type: 'TOGGLE_START'; key: string }
  | { type: 'TOGGLE_SUCCESS'; voice: Voice }
  | { type: 'TOGGLE_END' }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'SET_PROVIDER_FILTER'; providerFilter: ProviderFilter };

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
    case 'SYNC_SUCCESS':
      return { ...state, voices: action.voices };
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

    try {
      const service = await getVoicesService();
      const data = await service.findAll({
        pagination: false,
        providers: providerFilter === 'all' ? undefined : [providerFilter],
        search: search.trim() || undefined,
        sort: 'provider: 1, metadata.label: 1',
        voiceSource: ['catalog'],
      });
      dispatch({ type: 'LOAD_SUCCESS', voices: data });
    } catch (error) {
      logger.error('GET /voices failed', error);
      notifications.error('Failed to load voice catalog');
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
        const syncedVoices = await service.importCatalogVoices(providers);
        dispatch({ type: 'SYNC_SUCCESS', voices: syncedVoices });
        notifications.success('Voice catalog synced');
      } catch (error) {
        logger.error('POST /voices/import failed', error);
        notifications.error('Failed to sync voice catalog');
      } finally {
        dispatch({ type: 'SYNC_END' });
      }
    },
    [getVoicesService, notifications],
  );

  const handleToggle = useCallback(
    async (
      voice: Voice,
      field: 'isActive' | 'isDefaultSelectable' | 'isFeatured',
      value: boolean,
    ) => {
      dispatch({ type: 'TOGGLE_START', key: `${voice.id}:${field}` });

      try {
        const service = await getVoicesService();
        const updatedVoice = await service.patch(voice.id, {
          [field]: value,
        } as Partial<Voice>);

        dispatch({ type: 'TOGGLE_SUCCESS', voice: updatedVoice });
      } catch (error) {
        logger.error(`PATCH /voices/${voice.id} failed`, error);
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
      icon={HiOutlineSpeakerWave}
      label="Voice Library"
    >
      <VoicesCatalogControls
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
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {isLoading
            ? VOICE_SKELETON_KEYS.map((key) => (
                <Card key={key} className="min-h-[260px]" />
              ))
            : voices.map((voice) => (
                <VoiceCatalogCard
                  key={voice.id}
                  togglingKey={togglingKey}
                  voice={voice}
                  onToggle={handleToggle}
                />
              ))}
        </div>
      </WorkspaceSurface>
    </Container>
  );
}
