'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { VoiceProvider } from '@genfeedai/contracts';
import { getVoiceSpeechModel } from '@genfeedai/contracts/constants';
import type {
  HeyGenAvatarRef,
  HeyGenGender,
  HeyGenSpeechVoice,
} from '@genfeedai/contracts/interfaces';
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
import { useHeyGenSpeechVoices } from '@hooks/data/integrations/use-heygen-speech-voices';
import type { Voice } from '@models/ingredients/voice.model';
import { useVoiceCatalog } from '@pages/library/voices/hooks/use-voice-catalog';
import type { StudioPlaygroundType } from '@pages/studio/playground/types';
import { normalizeIdentityGender } from '@pages/studio/playground/utils/studio-identity-selection';
import { resolveStudioAssetUrl } from '@pages/studio/playground/utils/studio-playground-asset';
import { getIngredientDisplayLabel } from '@utils/media/ingredient-type.util';
import { useMemo } from 'react';

export interface StudioIdentityOption {
  /** `name (source)`: the accessible name and the composer summary. */
  label: string;
  name: string;
  source: string;
  value: string;
  /** Provider-stated gender; voices of the other gender are hidden for an avatar. */
  gender?: HeyGenGender | null;
  preview?: string;
  avatarRef?: HeyGenAvatarRef;
  voiceRef?: DefaultVoiceRef;
  disabled?: boolean;
}

export interface UseStudioPlaygroundIdentitiesParams {
  /** Chosen speech model; narrows Voice options to the providers it can speak. */
  modelKey?: string;
  type: StudioPlaygroundType;
}

export interface UseStudioPlaygroundIdentitiesReturn {
  retry: () => void;
  hasMoreAvatars: boolean;
  isLoadingMoreAvatars: boolean;
  loadMoreAvatars: () => Promise<void>;
  avatarOptions: readonly StudioIdentityOption[];
  error: string | null;
  /** Whether the workspace has its own HeyGen connection for voice clones. */
  hasHeyGenPersonalConnection: boolean;
  /** HeyGen Voice voices exist for the workspace, whatever model is chosen. */
  hasHeyGenSpeechVoices: boolean;
  /** HeyGen Voice voices were fetched successfully for this organization. */
  isHeyGenSpeechLoaded: boolean;
  isLoadingIdentities: boolean;
  voiceOptions: readonly StudioIdentityOption[];
}

function getVoiceName(voice: Voice): string {
  return voice.metadataLabel || voice.externalVoiceId || voice.id;
}

function toIdentityLabel(name: string, source: string) {
  return { label: `${name} (${source})`, name, source };
}

function toCatalogVoiceOption(voice: Voice): StudioIdentityOption {
  return {
    ...toIdentityLabel(getVoiceName(voice), String(voice.provider)),
    value: encodeCatalogVoiceValue(
      voice.provider as VoiceProvider,
      String(voice.externalVoiceId),
    ),
    gender: normalizeIdentityGender(voice.gender),
    preview: voice.sampleAudioUrl || undefined,
    voiceRef: buildDefaultVoiceRefFromVoice(voice) ?? {
      source: 'catalog' as const,
      provider: voice.provider as VoiceProvider,
      externalVoiceId: String(voice.externalVoiceId),
    },
  };
}

function toSpeechVoiceOption(voice: HeyGenSpeechVoice): StudioIdentityOption {
  return {
    ...toIdentityLabel(voice.name, `HeyGen Voice · ${voice.ownership}`),
    value: heyGenVoiceValue(voice),
    voiceRef: {
      source: 'catalog',
      provider: VoiceProvider.HEYGEN,
      externalVoiceId: voice.voiceId,
      label: voice.name,
      ownership: voice.ownership,
    },
  };
}

/**
 * The voice list is the org's own voices followed by the platform catalogue,
 * so a catalogue voice the org already holds appears twice. The org's copy
 * comes first and wins.
 */
function dedupeByValue(
  options: readonly StudioIdentityOption[],
): StudioIdentityOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) {
      return false;
    }
    seen.add(option.value);
    return true;
  });
}

export function useStudioPlaygroundIdentities({
  modelKey,
  type,
}: UseStudioPlaygroundIdentitiesParams): UseStudioPlaygroundIdentitiesReturn {
  const { organizationId } = useBrand();
  const isVoiceType = type === 'voice';
  // Avatar video uses HeyGen's stock catalogue; Voice uses HeyGen Voice
  // speech voices instead. Each surface fetches only its own source.
  const heygen = useHeyGenCatalog({ isEnabled: !isVoiceType });
  const heygenSpeech = useHeyGenSpeechVoices({ isEnabled: isVoiceType });
  const { avatars, isLoading: isLoadingAvatars } =
    useAvatarImages(organizationId);
  const { isLoading: isLoadingVoices, voices } = useVoiceCatalog({
    isActive: true,
  });

  const avatarOptions = useMemo<StudioIdentityOption[]>(
    () => [
      ...avatars
        .map((avatar) => ({
          ...toIdentityLabel(getIngredientDisplayLabel(avatar), 'Photo'),
          value: resolveStudioAssetUrl(avatar) ?? '',
          preview: resolveStudioAssetUrl(avatar),
        }))
        .filter((option) => Boolean(option.value)),
      ...heygen.avatars.map((avatar) => ({
        ...toIdentityLabel(
          avatar.name,
          `${avatar.avatarRef.ownership === 'public' ? 'Public preset' : 'Personal HeyGen'}${avatar.avatarRef.readiness.reason ? ` · ${avatar.avatarRef.readiness.reason}` : ''}`,
        ),
        value: heyGenAvatarValue(avatar.avatarRef),
        gender: avatar.gender,
        preview: avatar.preview || undefined,
        avatarRef: avatar.avatarRef,
        disabled: !avatar.avatarRef.readiness.usable,
      })),
    ],
    [avatars, heygen.avatars],
  );

  const voiceOptions = useMemo<StudioIdentityOption[]>(() => {
    if (isVoiceType) {
      const speakingProvider = getVoiceSpeechModel(modelKey)?.voiceProvider;
      return dedupeByValue([
        ...voices
          .filter(
            (voice) =>
              Boolean(voice.externalVoiceId || voice.isCloned) &&
              voice.provider === VoiceProvider.ELEVENLABS,
          )
          .map(toCatalogVoiceOption),
        ...heygenSpeech.voices.map(toSpeechVoiceOption),
      ]).filter(
        (option) =>
          !speakingProvider || option.voiceRef?.provider === speakingProvider,
      );
    }

    return dedupeByValue([
      ...voices
        .filter(
          (voice) =>
            Boolean(voice.externalVoiceId || voice.isCloned) &&
            voice.provider !== VoiceProvider.HEYGEN,
        )
        .map(toCatalogVoiceOption),
      ...heygen.voices.map((voice) => ({
        ...toIdentityLabel(voice.name, `HeyGen · ${voice.ownership}`),
        value: heyGenVoiceValue(voice),
        gender: voice.gender,
        preview: voice.preview || undefined,
        voiceRef: heyGenDefaultVoice(voice),
      })),
    ]);
  }, [heygen.voices, heygenSpeech.voices, isVoiceType, modelKey, voices]);
  const identitySource = isVoiceType ? heygenSpeech : heygen;
  return {
    retry: identitySource.retry,
    hasMoreAvatars: heygen.hasMoreAvatars,
    isLoadingMoreAvatars: heygen.isLoadingMoreAvatars,
    loadMoreAvatars: heygen.loadMoreAvatars,
    avatarOptions,
    error: identitySource.error,
    hasHeyGenPersonalConnection: heygenSpeech.hasPersonalConnection,
    hasHeyGenSpeechVoices: heygenSpeech.voices.length > 0,
    isHeyGenSpeechLoaded: heygenSpeech.isLoaded,
    voiceOptions,
    isLoadingIdentities: isVoiceType
      ? isLoadingVoices || heygenSpeech.isLoading
      : isLoadingAvatars || isLoadingVoices || heygen.isLoading,
  };
}
