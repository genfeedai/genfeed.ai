'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAvatarImages } from '@hooks/data/ingredients/use-avatar-images/use-avatar-images';
import type { Voice } from '@models/ingredients/voice.model';
import { useVoiceCatalog } from '@pages/library/voices/hooks/use-voice-catalog';
import { getIngredientDisplayLabel } from '@utils/media/ingredient-type.util';
import { useMemo } from 'react';

export interface StudioIdentityOption {
  label: string;
  value: string;
}

export interface UseStudioGenerateIdentitiesReturn {
  avatarOptions: readonly StudioIdentityOption[];
  isLoadingIdentities: boolean;
  voiceOptions: readonly StudioIdentityOption[];
}

function getVoiceName(voice: Voice): string {
  return voice.metadataLabel || voice.externalVoiceId || voice.id;
}

/**
 * Avatars and speaking voices for the composer's Identity section. Voice
 * option values are the provider-side `externalVoiceId` because that is what
 * `POST /voices/generate` and the avatar video endpoint hand to the provider —
 * the ingredient row id would be rejected upstream.
 */
export function useStudioGenerateIdentities(): UseStudioGenerateIdentitiesReturn {
  const { organizationId } = useBrand();
  const { avatars, isLoading: isLoadingAvatars } =
    useAvatarImages(organizationId);
  const { isLoading: isLoadingVoices, voices } = useVoiceCatalog({
    isActive: true,
  });

  const avatarOptions = useMemo(
    () =>
      avatars.map((avatar) => ({
        label: getIngredientDisplayLabel(avatar),
        value: String(avatar.id),
      })),
    [avatars],
  );

  const voiceOptions = useMemo(
    () =>
      voices
        .filter((voice) => Boolean(voice.externalVoiceId))
        .map((voice) => ({
          label: `${getVoiceName(voice)} (${voice.provider})`,
          value: String(voice.externalVoiceId),
        })),
    [voices],
  );

  return {
    avatarOptions,
    isLoadingIdentities: isLoadingAvatars || isLoadingVoices,
    voiceOptions,
  };
}
