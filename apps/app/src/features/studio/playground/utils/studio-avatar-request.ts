import type { HeyGenAvatarVideoRequest } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundSettings } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';

/** The words an avatar speaks: the script field, else the prompt itself. */
export function resolveStudioAvatarScript(
  speech: string | undefined,
  promptText: string | undefined,
): string {
  return speech?.trim() || promptText?.trim() || '';
}

/**
 * The avatar render Studio submits. Generate and the composer's quote both
 * send this body, so the estimate prices exactly what admission holds.
 * `modelKey` is the resolved engine, or empty for Auto.
 */
export function buildStudioAvatarRequest(
  settings: StudioPlaygroundSettings,
  script: string,
  modelKey: string,
): HeyGenAvatarVideoRequest {
  return {
    // `avatarId` on this endpoint means a HeyGen catalog id. Genfeed
    // portraits are our own ingredients, so they travel as `photoUrl`.
    photoUrl: settings.avatarRef ? undefined : settings.avatarPhotoUrl,
    avatarRef: settings.avatarRef,
    useIdentity: true,
    voiceRef: settings.voiceRef,
    voiceProvider: settings.voiceRef?.provider,
    text: script,
    voiceId: settings.voiceId,
    // Auto routes among the engines the look supports.
    ...(modelKey
      ? { autoSelectModel: false, model: modelKey }
      : { autoSelectModel: true, prioritize: settings.prioritize }),
  };
}
