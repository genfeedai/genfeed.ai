'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAvatarImages } from '@hooks/data/ingredients/use-avatar-images/use-avatar-images';
import type { Voice } from '@models/ingredients/voice.model';
import { useVoiceCatalog } from '@pages/library/voices/hooks/use-voice-catalog';
import { resolveStudioAssetUrl } from '@pages/studio/generate/utils/studio-generate-asset';
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
 * Avatars and speaking voices for the composer's Identity section.
 *
 * Both option values are provider-facing, never Genfeed row ids:
 * - Avatar values are the portrait's public URL, sent as `photoUrl`. The
 *   endpoint's `avatarId` field means a HeyGen *catalog* id, so posting an
 *   ingredient id there 404s in `resolvePhotoUrl`.
 * - Voice values are the provider-side `externalVoiceId`, which is what
 *   `POST /voices/generate` hands upstream.
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
      avatars
        .map((avatar) => ({
          label: getIngredientDisplayLabel(avatar),
          value: resolveStudioAssetUrl(avatar) ?? '',
        }))
        .filter((option) => Boolean(option.value)),
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
