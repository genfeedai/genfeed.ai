'use client';

import { ButtonSize, ButtonVariant, VoiceProvider } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Voice } from '@models/ingredients/voice.model';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { VoicesService } from '@services/ingredients/voices.service';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiArrowPath,
  HiMagnifyingGlass,
  HiOutlineSpeakerWave,
  HiSparkles,
  HiStar,
} from 'react-icons/hi2';

type ProviderFilter = 'all' | VoiceProvider.ELEVENLABS | VoiceProvider.HEYGEN;

const PROVIDER_FILTERS: Array<{ label: string; value: ProviderFilter }> = [
  { label: 'All providers', value: 'all' },
  { label: 'ElevenLabs', value: VoiceProvider.ELEVENLABS },
  { label: 'HeyGen', value: VoiceProvider.HEYGEN },
];

function getVoiceName(voice: Voice): string {
  return voice.metadataLabel || voice.externalVoiceId || voice.id;
}

function getProviderLabel(provider?: string): string {
  switch (provider) {
    case VoiceProvider.ELEVENLABS:
      return 'ElevenLabs';
    case VoiceProvider.HEYGEN:
      return 'HeyGen';
    default:
      return provider ?? 'Unknown';
  }
}

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
      <WorkspaceSurface
        title="Catalog Controls"
        tone="muted"
        data-testid="voices-library-controls-surface"
      >
        <div className="flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/70">
                Search
              </label>
              <div className="relative">
                <HiMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                <Input
                  className="pl-9"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or external ID"
                  value={search}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/70">
                Provider
              </label>
              <Select
                onValueChange={(value) =>
                  setProviderFilter(value as ProviderFilter)
                }
                value={providerFilter}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_FILTERS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              isDisabled={isSyncingAll || syncingProvider !== null}
              onClick={() => handleSync()}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
            >
              <HiArrowPath className="mr-2 h-4 w-4" />
              Sync All
            </Button>
            <Button
              isDisabled={isSyncingAll || syncingProvider !== null}
              onClick={() => handleSync([VoiceProvider.ELEVENLABS])}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              Sync ElevenLabs
            </Button>
            <Button
              isDisabled={isSyncingAll || syncingProvider !== null}
              onClick={() => handleSync([VoiceProvider.HEYGEN])}
              size={ButtonSize.SM}
              variant={ButtonVariant.OUTLINE}
              withWrapper={false}
            >
              Sync HeyGen
            </Button>
          </div>
        </div>
      </WorkspaceSurface>

      <WorkspaceSurface
        className="mt-6"
        title="Catalog Voices"
        tone="muted"
        data-testid="voices-library-results-surface"
      >
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, index) => (
                <Card
                  key={`voice-skeleton-${index}`}
                  className="min-h-[260px]"
                />
              ))
            : voices.map((voice) => {
                const activeKey = `${voice.id}:isActive`;
                const defaultKey = `${voice.id}:isDefaultSelectable`;
                const featuredKey = `${voice.id}:isFeatured`;

                return (
                  <Card key={voice.id}>
                    <div className="space-y-4 p-5">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            {getProviderLabel(voice.provider)}
                          </Badge>
                          {voice.isFeatured ? (
                            <Badge variant="warning">Featured</Badge>
                          ) : null}
                          {voice.isDefaultSelectable === false ? (
                            <Badge variant="secondary">
                              Not default selectable
                            </Badge>
                          ) : null}
                          {voice.isActive === false ? (
                            <Badge variant="destructive">Inactive</Badge>
                          ) : null}
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-foreground">
                            {getVoiceName(voice)}
                          </h3>
                          <p className="truncate text-xs text-foreground/50">
                            {voice.externalVoiceId ?? voice.id}
                          </p>
                        </div>
                      </div>

                      <InsetSurface density="compact" tone="contrast">
                        <AudioPreviewPlayer
                          audioUrl={voice.sampleAudioUrl ?? null}
                          label={getVoiceName(voice)}
                        />
                      </InsetSurface>

                      <div className="grid gap-2">
                        <Button
                          isDisabled={togglingKey === activeKey}
                          onClick={() =>
                            handleToggle(voice, 'isActive', !voice.isActive)
                          }
                          size={ButtonSize.SM}
                          variant={
                            voice.isActive === false
                              ? ButtonVariant.OUTLINE
                              : ButtonVariant.DEFAULT
                          }
                          withWrapper={false}
                        >
                          <HiSparkles className="mr-2 h-4 w-4" />
                          {voice.isActive === false ? 'Activate' : 'Active'}
                        </Button>

                        <Button
                          isDisabled={togglingKey === defaultKey}
                          onClick={() =>
                            handleToggle(
                              voice,
                              'isDefaultSelectable',
                              voice.isDefaultSelectable === false,
                            )
                          }
                          size={ButtonSize.SM}
                          variant={
                            voice.isDefaultSelectable === false
                              ? ButtonVariant.OUTLINE
                              : ButtonVariant.SECONDARY
                          }
                          withWrapper={false}
                        >
                          {voice.isDefaultSelectable === false
                            ? 'Enable default selection'
                            : 'Default selectable'}
                        </Button>

                        <Button
                          isDisabled={togglingKey === featuredKey}
                          onClick={() =>
                            handleToggle(voice, 'isFeatured', !voice.isFeatured)
                          }
                          size={ButtonSize.SM}
                          variant={
                            voice.isFeatured
                              ? ButtonVariant.DEFAULT
                              : ButtonVariant.GHOST
                          }
                          withWrapper={false}
                        >
                          <HiStar className="mr-2 h-4 w-4" />
                          {voice.isFeatured ? 'Featured' : 'Mark featured'}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
        </div>
      </WorkspaceSurface>
    </Container>
  );
}
