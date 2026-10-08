import type { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import type { HeyGenIdentityService } from '@api/services/integrations/heygen/services/heygen-identity.service';

export async function normalizeBrandIdentityDefaults(
  config: UpdateBrandAgentConfigDto,
  organizationId: string,
  identities: HeyGenIdentityService,
  clearNativeForPhoto: boolean,
): Promise<Record<string, unknown>> {
  const normalized: Record<string, unknown> = { ...config };
  if (config.defaultAvatarRef) {
    normalized.defaultAvatarRef = await identities.avatarDefault(
      config.defaultAvatarRef,
      organizationId,
    );
    normalized.defaultAvatarPhotoUrl = null;
    normalized.defaultAvatarIngredientId = null;
    normalized.heygenAvatarId = null;
  } else if (
    clearNativeForPhoto &&
    (config.defaultAvatarPhotoUrl || config.defaultAvatarIngredientId)
  ) {
    normalized.defaultAvatarRef = null;
  }
  if (config.defaultVoiceRef)
    normalized.defaultVoiceRef = await identities.voiceDefault(
      config.defaultVoiceRef,
      organizationId,
    );
  return normalized;
}
