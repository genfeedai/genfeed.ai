'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { VoiceProvider } from '@genfeedai/contracts';
import type { HeyGenAvatarRef } from '@genfeedai/contracts/interfaces';
import {
  buildDefaultVoiceRefFromVoice,
  type DefaultVoiceRef,
  encodeCatalogVoiceValue,
} from '@helpers/voice/default-voice-ref.helper';
import {
  heyGenAvatarValue,
  heyGenDefaultVoice,
  heyGenVoiceValue,
} from '@helpers/voice/heygen-identity.helper';
import { useAvatarImages } from '@hooks/data/ingredients/use-avatar-images/use-avatar-images';
import { useHeyGenCatalog } from '@hooks/data/integrations/use-heygen-catalog';
import type { Voice } from '@models/ingredients/voice.model';
import { useVoiceCatalog } from '@pages/library/voices/hooks/use-voice-catalog';
import { resolveStudioAssetUrl } from '@pages/studio/playground/utils/studio-playground-asset';
import { getIngredientDisplayLabel } from '@utils/media/ingredient-type.util';
import { useMemo } from 'react';

export interface StudioIdentityOption {
  label: string;
  value: string;
  preview?: string;
  avatarRef?: HeyGenAvatarRef;
  voiceRef?: DefaultVoiceRef;
  disabled?: boolean;
}

export interface UseStudioPlaygroundIdentitiesReturn {
  retry: () => void;
  hasMoreAvatars: boolean;
  isLoadingMoreAvatars: boolean;
  loadMoreAvatars: () => Promise<void>;
  avatarOptions: readonly StudioIdentityOption[];
  error: string | null;
  isLoadingIdentities: boolean;
  voiceOptions: readonly StudioIdentityOption[];
}

function getVoiceName(voice: Voice): string {
  return voice.metadataLabel || voice.externalVoiceId || voice.id;
}

export function useStudioPlaygroundIdentities(): UseStudioPlaygroundIdentitiesReturn {
  const { organizationId } = useBrand();
  const heygen = useHeyGenCatalog();
  const { avatars, isLoading: isLoadingAvatars } =
    useAvatarImages(organizationId);
  const { isLoading: isLoadingVoices, voices } = useVoiceCatalog({
    isActive: true,
  });

  const avatarOptions = useMemo<StudioIdentityOption[]>(
    () => [
      ...avatars
        .map((avatar) => ({
          label: `${getIngredientDisplayLabel(avatar)} (Photo)`,
          value: resolveStudioAssetUrl(avatar) ?? '',
          preview: resolveStudioAssetUrl(avatar),
        }))
        .filter((option) => Boolean(option.value)),
      ...heygen.avatars.map((avatar) => ({
        label: `${avatar.name} (${avatar.avatarRef.ownership === 'public' ? 'Public preset' : 'Personal HeyGen'})${avatar.avatarRef.readiness.reason ? ` · ${avatar.avatarRef.readiness.reason}` : ''}`,
        value: heyGenAvatarValue(avatar.avatarRef),
        preview: avatar.preview || undefined,
        avatarRef: avatar.avatarRef,
        disabled: !avatar.avatarRef.readiness.usable,
      })),
    ],
    [avatars, heygen.avatars],
  );

  const voiceOptions = useMemo<StudioIdentityOption[]>(
    () => [
      ...voices
        .filter(
          (voice) =>
            Boolean(voice.externalVoiceId || voice.isCloned) &&
            voice.provider !== VoiceProvider.HEYGEN,
        )
        .map((voice) => ({
          label: `${getVoiceName(voice)} (${voice.provider})`,
          value: encodeCatalogVoiceValue(
            voice.provider as VoiceProvider,
            String(voice.externalVoiceId),
          ),
          preview: voice.sampleAudioUrl || undefined,
          voiceRef: buildDefaultVoiceRefFromVoice(voice) ?? {
            source: 'catalog' as const,
            provider: voice.provider as VoiceProvider,
            externalVoiceId: String(voice.externalVoiceId),
          },
        })),
      ...heygen.voices.map((voice) => ({
        label: `${voice.name} (HeyGen · ${voice.ownership})`,
        value: heyGenVoiceValue(voice),
        preview: voice.preview || undefined,
        voiceRef: heyGenDefaultVoice(voice),
      })),
    ],
    [voices, heygen.voices],
  );
  return {
    retry: heygen.retry,
    hasMoreAvatars: heygen.hasMoreAvatars,
    isLoadingMoreAvatars: heygen.isLoadingMoreAvatars,
    loadMoreAvatars: heygen.loadMoreAvatars,
    avatarOptions,
    error: heygen.error,
    voiceOptions,
    isLoadingIdentities:
      isLoadingAvatars || isLoadingVoices || heygen.isLoading,
  };
}
