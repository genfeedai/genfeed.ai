'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AvatarTwinStatus,
  IngredientCategory,
  VoiceProvider,
} from '@genfeedai/contracts';
import type {
  IAvatarTwin,
  IHeyGenConnectionStatus,
} from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { logger } from '@services/core/logger.service';
import { AvatarTwinsService } from '@services/ingredients/avatar-twins.service';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { VideosService } from '@services/ingredients/videos.service';
import { BrandsService } from '@services/social/brands.service';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type {
  AvatarTwinBrandUsage,
  AvatarTwinEnrollment,
  AvatarTwinSubmitInput,
  AvatarTwinSubmitPhase,
  AvatarTwinVoiceChoice,
} from '@/features/avatar-twins/props/avatar-twin.props';

const TWINS_KEY = ['avatar-twins'] as const;
const CONNECTION_KEY = ['heygen-connection-status'] as const;
/** Training takes minutes; consent is confirmed within seconds of recording it. */
const POLL_INTERVAL_MS = 10_000;

/** Statuses that change on the provider's side without anything we do. */
export const AVATAR_TWIN_WAITING_STATUSES: readonly AvatarTwinStatus[] = [
  AvatarTwinStatus.UPLOADING,
  AvatarTwinStatus.TRAINING,
  AvatarTwinStatus.AWAITING_CONSENT,
];

function isWaiting(twin: IAvatarTwin | null | undefined): boolean {
  return !!twin && AVATAR_TWIN_WAITING_STATUSES.includes(twin.status);
}

function newIdempotencyKey(): string {
  return `twin-${crypto.randomUUID()}`;
}

/**
 * The person's latest digital twin and every step that moves it forward:
 * submit a take, open consent, delete. While the provider is still working
 * the twin is re-read every few seconds and whenever the tab regains focus
 * (the person comes back from the consent page).
 */
export function useAvatarTwinEnrollment(): AvatarTwinEnrollment {
  const queryClient = useQueryClient();
  const getTwinsService = useAuthedService((token: string) =>
    AvatarTwinsService.getInstance(token),
  );
  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const { brandId } = useCollectionScope();
  const { refreshBrands, selectedBrand } = useBrand();

  const [isRetaking, setIsRetaking] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<AvatarTwinSubmitPhase | null>(
    null,
  );
  const [uploadProgress, setUploadProgress] = useState(0);

  const connectionQuery = useAuthedQuery<
    HeyGenService,
    IHeyGenConnectionStatus
  >({
    queryFn: (service, signal) => service.fetchConnectionStatus(signal),
    queryKey: CONNECTION_KEY,
    refetchOnWindowFocus: true,
    service: (token: string) => HeyGenService.getInstance(token),
  });

  const twinQuery = useAuthedQuery<AvatarTwinsService, IAvatarTwin | null>({
    queryFn: async (service, signal) => {
      const [latest] = await service.list(signal);
      if (!latest) return null;
      // The list is what we stored; a single read asks the provider.
      return isWaiting(latest) ? service.get(latest.id, signal) : latest;
    },
    queryKey: TWINS_KEY,
    refetchInterval: (query) =>
      isWaiting(query.state.data) ? POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
    service: (token: string) => AvatarTwinsService.getInstance(token),
  });

  const refreshTwin = useCallback(
    () => queryClient.invalidateQueries({ queryKey: TWINS_KEY }),
    [queryClient],
  );

  const submit = useCallback(
    async ({
      isRecordingKept,
      name,
      recording,
    }: AvatarTwinSubmitInput): Promise<void> => {
      setUploadProgress(0);
      setSubmitPhase('uploading');
      try {
        const videos = await getVideosService();
        const slot = await videos.getPresignedUploadUrl(
          recording.name,
          recording.type,
          IngredientCategory.VIDEO,
          recording.size,
        );
        await videos.uploadDirectToS3(
          recording,
          slot.uploadUrl,
          (progress) => setUploadProgress(progress),
          { key: slot.s3Key, type: IngredientCategory.VIDEO },
        );
        const saved = await videos.confirmUpload(slot.id);
        if (!saved?.id) throw new Error('The recording was not saved.');

        setSubmitPhase('starting');
        const twins = await getTwinsService();
        await twins.start({
          idempotencyKey: newIdempotencyKey(),
          isRecordingKept,
          name,
          sourceIngredientId: saved.id,
        });
        setIsRetaking(false);
        await refreshTwin();
      } catch (error: unknown) {
        logger.error('Avatar twin submission failed', error);
        throw error;
      } finally {
        setSubmitPhase(null);
      }
    },
    [getTwinsService, getVideosService, refreshTwin],
  );

  const openConsent = useCallback(
    async (twinId: string, returnPath: string): Promise<string> => {
      const twins = await getTwinsService();
      const link = await twins.requestConsentLink(twinId, returnPath);
      await refreshTwin();
      return link.consentUrl;
    },
    [getTwinsService, refreshTwin],
  );

  const remove = useCallback(
    async (twinId: string): Promise<void> => {
      const twins = await getTwinsService();
      await twins.remove(twinId);
      // Deleting a twin clears brand defaults that used it: reload them so
      // Studio stops offering the deleted look.
      await Promise.all([refreshTwin(), refreshBrands()]);
    },
    [getTwinsService, refreshBrands, refreshTwin],
  );

  const brandConfig =
    selectedBrand?.id === brandId ? selectedBrand?.agentConfig : undefined;
  const brandUsage = useMemo<AvatarTwinBrandUsage | null>(() => {
    if (!brandId) return null;
    const lookId = twinQuery.data?.providerLookId;
    return {
      hasVoice: Boolean(
        brandConfig?.defaultVoiceRef || brandConfig?.defaultVoiceId,
      ),
      isUsingTwin: !!lookId && brandConfig?.defaultAvatarRef?.lookId === lookId,
    };
  }, [brandConfig, brandId, twinQuery.data?.providerLookId]);

  const applyToBrand = useCallback(
    async (twin: IAvatarTwin, voice: AvatarTwinVoiceChoice): Promise<void> => {
      if (!brandId || !twin.providerLookId) return;
      const brands = await getBrandsService();
      await brands.updateAgentConfig(brandId, {
        defaultAvatarIngredientId: null,
        defaultAvatarRef: {
          groupId: twin.providerGroupId,
          lookId: twin.providerLookId,
          ownership: 'private',
          source: 'heygen-look',
        },
        ...(voice === 'twin' && twin.voiceId
          ? {
              defaultVoiceId: null,
              defaultVoiceRef: {
                externalVoiceId: twin.voiceId,
                label: twin.name,
                ownership: 'private' as const,
                provider: VoiceProvider.HEYGEN,
                source: 'catalog' as const,
              },
            }
          : {}),
      });
      await refreshBrands();
    },
    [brandId, getBrandsService, refreshBrands],
  );

  const recheckConnection = useCallback(
    () => queryClient.invalidateQueries({ queryKey: CONNECTION_KEY }),
    [queryClient],
  );

  return {
    brandUsage,
    connectionState: connectionQuery.data?.state ?? null,
    isLoading: connectionQuery.isLoading || twinQuery.isLoading,
    isRetaking,
    loadError: connectionQuery.error ?? twinQuery.error ?? null,
    openConsent,
    recheckConnection,
    refreshTwin,
    remove,
    setIsRetaking,
    submit,
    submitPhase,
    twin: twinQuery.data ?? null,
    uploadProgress,
    applyToBrand,
  };
}
