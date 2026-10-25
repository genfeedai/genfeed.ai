import type { IBrand, TurboIdeaFormat } from '@genfeedai/contracts/interfaces';

export interface BrandReadinessResult {
  ready: boolean;
  reasons: string[];
}

/**
 * Whether a brand can generate Turbo ideas for the requested formats.
 *
 * Image and video generation need nothing beyond a selected brand: brand
 * references fall back to the logo (or none) and the brand voice falls back to
 * its defaults. A connected social account is only needed to schedule, which
 * the Schedule step checks.
 *
 * Avatar needs:
 *  - defaultAvatarIngredientId (the generation path only threads the avatar
 *    ingredient id into the HeyGen payload; a photo-only avatar config cannot
 *    drive avatar generation, so it is not accepted here)
 *  - defaultVoiceId
 */
export function isBrandReadyForTurbo(
  brand: IBrand | null | undefined,
  formats?: TurboIdeaFormat[],
): BrandReadinessResult {
  const reasons: string[] = [];

  if (!brand) {
    return { ready: false, reasons: ['No brand selected'] };
  }

  if (formats?.includes('avatar')) {
    if (!brand.agentConfig?.defaultAvatarIngredientId) {
      reasons.push('A default avatar is required for avatar generation');
    }
    if (!brand.agentConfig?.defaultVoiceId) {
      reasons.push('A default voice is required for avatar generation');
    }
  }

  return { ready: reasons.length === 0, reasons };
}
