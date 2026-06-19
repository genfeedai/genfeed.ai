import type { CredentialPlatform } from '@genfeedai/enums';
import type { IBrand, ICredential } from '@genfeedai/interfaces';
import type { FastlaneFormat } from '../types';

const SHORT_FORM_PLATFORMS: string[] = ['tiktok', 'instagram', 'youtube'];

export interface BrandReadinessResult {
  ready: boolean;
  reasons: string[];
}

/**
 * Checks whether a brand has the minimum configuration required to run Fastlane.
 *
 * Required for all formats:
 *  - Brand voice tone is set (agentConfig.voice.tone)
 *  - At least one reference image
 *  - At least one short-form social credential connected (TikTok / Instagram / YouTube)
 *
 * Additional requirements when `formats` includes 'avatar':
 *  - defaultAvatarIngredientId (or defaultAvatarPhotoUrl) is set
 *  - defaultVoiceId is set
 */
export function isBrandReadyForFastlane(
  brand: IBrand | null | undefined,
  credentials: ICredential[],
  formats?: FastlaneFormat[],
): BrandReadinessResult {
  const reasons: string[] = [];

  if (!brand) {
    return { ready: false, reasons: ['No brand selected'] };
  }

  // Voice tone check
  const hasVoiceTone = Boolean(brand.agentConfig?.voice?.tone?.trim());
  if (!hasVoiceTone) {
    reasons.push('Brand voice tone is not configured');
  }

  // Reference image check
  const hasReferenceImage = (brand.references?.length ?? 0) >= 1;
  if (!hasReferenceImage) {
    reasons.push('At least one brand reference image is required');
  }

  // Short-form social credential check — case-insensitive
  const hasShortFormSocial = credentials.some((cred) =>
    SHORT_FORM_PLATFORMS.includes(
      (cred.platform as string).toLowerCase() as CredentialPlatform,
    ),
  );
  if (!hasShortFormSocial) {
    reasons.push(
      'A connected TikTok, Instagram, or YouTube account is required',
    );
  }

  // Avatar-specific requirements
  if (formats?.includes('avatar')) {
    const hasAvatar =
      Boolean(brand.agentConfig?.defaultAvatarIngredientId) ||
      Boolean(brand.agentConfig?.defaultAvatarPhotoUrl);
    if (!hasAvatar) {
      reasons.push('A default avatar is required for avatar generation');
    }

    const hasVoice = Boolean(brand.agentConfig?.defaultVoiceId);
    if (!hasVoice) {
      reasons.push('A default voice is required for avatar generation');
    }
  }

  return { ready: reasons.length === 0, reasons };
}
