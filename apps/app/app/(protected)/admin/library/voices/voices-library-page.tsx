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
import { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function VoicesLibraryPage() {
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const getVoicesService = useAuthedService((token: string) =>
    VoicesService.getInstance(token),
  );

  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingProvider, setSyncingProvider] = useState<VoiceProvider | null>(
    null,
  );
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const loadVoices = useCallback(async () => {
    setIsLoading(true);

    try {
      const service = await getVoicesService();
      const data = await service.findAll({
        pagination: false,
        providers: providerFilter === 'all' ? undefined : [providerFilter],
        search: search.trim() || undefined,
        sort: 'provider: 1, metadata.label: 1',
        voiceSource: ['catalog'],
      });
      setVoices(data);
    } catch (error) {
      logger.error('GET /voices failed', error);
      notifications.error('Failed to load voice catalog');
      setVoices([]);
    } finally {
      setIsLoading(false);
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

      if (provider) {
        setSyncingProvider(provider);
      } else {
        setIsSyncingAll(true);
      }

      try {
        const service = await getVoicesService();
        const syncedVoices = await service.importCatalogVoices(providers);
        setVoices(syncedVoices);
        notifications.success('Voice catalog synced');
      } catch (error) {
        logger.error('POST /voices/import failed', error);
        notifications.error('Failed to sync voice catalog');
      } finally {
        setSyncingProvider(null);
        setIsSyncingAll(false);
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
      setTogglingKey(`${voice.id}:${field}`);

      try {
        const service = await getVoicesService();
        const updatedVoice = await service.patch(voice.id, {
          [field]: value,
        } as Partial<Voice>);

        setVoices((current) =>
          current.map((item) => (item.id === voice.id ? updatedVoice : item)),
        );
      } catch (error) {
        logger.error(`PATCH /voices/${voice.id} failed`, error);
        notifications.error('Failed to update voice');
      } finally {
        setTogglingKey(null);
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
        onProviderFilterChange={setProviderFilter}
        onSearchChange={setSearch}
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
