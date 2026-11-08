'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { VoiceProvider } from '@genfeedai/contracts';
import type {
  ElevenLabsAccountVoicePage,
  IHeyGenConnectionStatus,
} from '@genfeedai/contracts/interfaces';
import { buildDefaultVoiceRefFromVoice } from '@helpers/voice/default-voice-ref.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { logger } from '@services/core/logger.service';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { VoiceCloneService } from '@services/ingredients/voice-clone.service';
import { VoicesService } from '@services/ingredients/voices.service';
import { BrandsService } from '@services/social/brands.service';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type {
  VoiceSampleProblem,
  VoiceStudio,
  VoiceStudioCreated,
  VoiceStudioCreateInput,
  VoiceStudioPhase,
  VoiceStudioProvider,
} from '@/features/voice-studio/props/voice-studio.props';
import { prepareVoiceSample } from '@/features/voice-studio/utils/voice-sample-wav';
import { VOICE_SAMPLE_MIN_SECONDS } from '@/features/voice-studio/voice-studio.constants';

/** Shared with the twin wizard and the Voices callout: one read each. */
const HEYGEN_KEY = ['heygen-connection-status'] as const;
const ELEVENLABS_KEY = ['elevenlabs-account-voices', ''] as const;

/** A take refused before upload; `problem` keys the message to show. */
export class VoiceSampleError extends Error {
  constructor(readonly problem: VoiceSampleProblem) {
    super(problem);
    this.name = 'VoiceSampleError';
  }
}

/**
 * Which of the person's own accounts can clone a voice, and the one step
 * that turns a take into a voice there: convert to WAV, clone, and
 * optionally make it the brand's default voice.
 */
export function useVoiceStudio(): VoiceStudio {
  const queryClient = useQueryClient();
  const { brandId } = useCollectionScope();
  const { refreshBrands } = useBrand();
  const [phase, setPhase] = useState<VoiceStudioPhase | null>(null);
  const getCloneService = useAuthedService((token: string) =>
    VoiceCloneService.getInstance(token),
  );
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const heyGenQuery = useAuthedQuery<HeyGenService, IHeyGenConnectionStatus>({
    queryFn: (service, signal) => service.fetchConnectionStatus(signal),
    queryKey: HEYGEN_KEY,
    refetchOnWindowFocus: true,
    service: (token: string) => HeyGenService.getInstance(token),
  });
  const elevenLabsQuery = useAuthedQuery<
    VoicesService,
    ElevenLabsAccountVoicePage
  >({
    queryFn: (service, signal) => service.findAccountVoices({}, signal),
    queryKey: ELEVENLABS_KEY,
    refetchOnWindowFocus: true,
    service: (token: string) => VoicesService.getInstance(token),
  });

  const connectedProviders = useMemo(() => {
    const providers: VoiceStudioProvider[] = [];
    if (heyGenQuery.data?.state === 'connected')
      providers.push(VoiceProvider.HEYGEN);
    if (elevenLabsQuery.data?.connection.status === 'connected')
      providers.push(VoiceProvider.ELEVENLABS);
    return providers;
  }, [elevenLabsQuery.data, heyGenQuery.data]);

  const create = useCallback(
    async (input: VoiceStudioCreateInput): Promise<VoiceStudioCreated> => {
      setPhase('preparing');
      try {
        const sample = await prepareVoiceSample(
          input.recording,
          'voice-sample.wav',
        );
        if (sample.durationSeconds < VOICE_SAMPLE_MIN_SECONDS)
          throw new VoiceSampleError('tooShort');
        if (sample.isTooQuiet) throw new VoiceSampleError('tooQuiet');

        setPhase('cloning');
        const formData = new FormData();
        formData.append('name', input.name.trim());
        formData.append('provider', input.provider);
        formData.append('file', sample.file);
        const voice = await (await getCloneService()).cloneVoice(formData);

        const created = { provider: input.provider, voice };
        if (!input.isBrandDefault || !brandId)
          return { ...created, brandDefault: 'skipped' };
        // The voice already exists in the person's account: a failed brand
        // update must not send them back to record and clone it again.
        try {
          await (await getBrandsService()).updateAgentConfig(brandId, {
            defaultVoiceId: voice.id,
            defaultVoiceRef: buildDefaultVoiceRefFromVoice(voice),
          });
          await refreshBrands();
          return { ...created, brandDefault: 'set' };
        } catch (error: unknown) {
          logger.error('Voice studio brand default failed', error);
          return { ...created, brandDefault: 'failed' };
        }
      } finally {
        setPhase(null);
      }
    },
    [brandId, getBrandsService, getCloneService, refreshBrands],
  );

  const recheckConnections = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: HEYGEN_KEY });
    void queryClient.invalidateQueries({ queryKey: ELEVENLABS_KEY });
  }, [queryClient]);

  return {
    connectedProviders,
    create,
    hasBrand: Boolean(brandId),
    hasConnectionError:
      connectedProviders.length === 0 &&
      (heyGenQuery.isError || elevenLabsQuery.isError),
    isLoading: heyGenQuery.isLoading || elevenLabsQuery.isLoading,
    phase,
    recheckConnections,
  };
}
