import type { HeyGenGender } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundSettings } from '@pages/studio/playground/types';

/** A provider's loose gender label ("Male", "female", "unknown") or null. */
export function normalizeIdentityGender(
  value: string | null | undefined,
): HeyGenGender | null {
  const gender = value?.trim().toLowerCase();
  return gender === 'male' || gender === 'female' ? gender : null;
}

/**
 * A voice fits an avatar unless both state a gender and they differ. Unknown
 * genders stay available so clones and photo avatars are never hidden.
 */
export function isVoiceGenderCompatible(
  avatarGender: HeyGenGender | null | undefined,
  voiceGender: HeyGenGender | null | undefined,
): boolean {
  return !avatarGender || !voiceGender || avatarGender === voiceGender;
}

export function hasStudioAvatarSelection(
  settings: Pick<StudioPlaygroundSettings, 'avatarPhotoUrl' | 'avatarRef'>,
): boolean {
  return Boolean(settings.avatarRef || settings.avatarPhotoUrl);
}

/**
 * A voice counts as picked only when its id travels with its `voiceRef`, which
 * carries the provider. An id alone (an Agent handoff, an old saved pick)
 * cannot be quoted or sent, so the user re-picks instead of hitting a throw.
 */
export function hasStudioVoiceSelection(
  settings: Pick<StudioPlaygroundSettings, 'voiceId' | 'voiceRef'>,
): boolean {
  return Boolean(settings.voiceId && settings.voiceRef);
}
