import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import type {
  AvatarIdentityDefaults,
  AvatarIdentityResolutionDependencies,
  AvatarVideoGenerationContext,
  AvatarVideoGenerationParams,
  ResolvedIdentity,
} from '@api/collections/videos/services/avatar-video-generation.types';
import { heyGenAvatarRefSchema } from '@api/services/integrations/heygen/heygen-identity.schema';
import { HttpException, HttpStatus } from '@nestjs/common';

export async function resolveAvatarIdentityInputs(
  params: AvatarVideoGenerationParams,
  context: AvatarVideoGenerationContext,
  brand: BrandDocument | null,
  deps: AvatarIdentityResolutionDependencies,
): Promise<ResolvedIdentity> {
  const resolved: ResolvedIdentity = {
    audioIngredientId: params.audioIngredientId,
    voiceRef: params.voiceRef,
    audioUrl: params.audioUrl,
    elevenlabsVoiceId: params.elevenlabsVoiceId,
    heygenVoiceId: params.heygenVoiceId,
    photoIngredientId: params.photoIngredientId,
    photoUrl: params.photoUrl,
  };

  if (params.voiceRef) {
    if (
      params.heygenVoiceId ||
      params.elevenlabsVoiceId ||
      params.clonedVoiceId ||
      params.audioUrl ||
      params.audioIngredientId
    )
      throw new HttpException(
        'Choose only one speech source',
        HttpStatus.BAD_REQUEST,
      );
    Object.assign(
      resolved,
      await deps.resolveSavedVoiceRef(
        params.voiceRef,
        context.organizationId,
        params.text,
        true,
      ),
    );
  }

  if (
    params.clonedVoiceId &&
    !resolved.audioUrl &&
    !resolved.audioIngredientId &&
    !resolved.elevenlabsVoiceId &&
    !resolved.heygenVoiceId &&
    !resolved.savedVoice
  ) {
    const savedVoice = await deps.findVoiceById(
      params.clonedVoiceId,
      context.organizationId,
    );
    if (!savedVoice) {
      throw deps.invalidSavedVoiceException();
    }

    const resolvedSavedVoice = deps.resolveVoiceLookup({
      ...savedVoice,
      provider: params.voiceProvider ?? savedVoice.provider,
    });
    if (!deps.hasUsableVoiceSource(resolvedSavedVoice)) {
      throw deps.invalidSavedVoiceException();
    }

    resolved.audioUrl = resolvedSavedVoice.audioUrl;
    resolved.elevenlabsVoiceId =
      resolvedSavedVoice.elevenlabsVoiceId ?? resolved.elevenlabsVoiceId;
    resolved.heygenVoiceId =
      resolvedSavedVoice.heygenVoiceId ?? resolved.heygenVoiceId;
    resolved.savedVoice = resolvedSavedVoice.savedVoice ?? resolved.savedVoice;
  }

  if (!params.useIdentity) return resolved;
  const organizationSettings = await deps.orgSettingsService.findOne({
    organizationId: context.organizationId,
  });
  const effectiveBrandAgentConfig = resolveEffectiveBrandAgentConfig({
    brand,
    organizationSettings,
  });
  const brandIdentityDefaults =
    effectiveBrandAgentConfig.identityDefaults.brand;
  const organizationIdentityDefaults =
    effectiveBrandAgentConfig.identityDefaults.organization;

  applyAvatarDefaults(
    params,
    resolved,
    brandIdentityDefaults,
    organizationIdentityDefaults,
  );
  return applyVoiceDefaults(
    params,
    context,
    resolved,
    brandIdentityDefaults,
    organizationIdentityDefaults,
    deps,
  );
}

function applyAvatarDefaults(
  params: AvatarVideoGenerationParams,
  resolved: ResolvedIdentity,
  brandIdentityDefaults: AvatarIdentityDefaults,
  organizationIdentityDefaults: AvatarIdentityDefaults,
): void {
  if (
    !params.avatarRef &&
    !params.avatarId &&
    !resolved.photoUrl &&
    !resolved.photoIngredientId
  ) {
    const defaults =
      brandIdentityDefaults.defaultAvatarRef ||
      brandIdentityDefaults.defaultAvatarIngredientId ||
      brandIdentityDefaults.defaultAvatarPhotoUrl
        ? brandIdentityDefaults
        : organizationIdentityDefaults;
    if (defaults.defaultAvatarRef) {
      const parsed = heyGenAvatarRefSchema.safeParse(defaults.defaultAvatarRef);
      if (!parsed.success)
        throw new HttpException(
          'Reselect the saved avatar to verify its connection.',
          HttpStatus.BAD_REQUEST,
        );
      resolved.avatarRef = parsed.data;
    }
  }

  if (
    !params.avatarId &&
    !params.avatarRef &&
    !resolved.avatarRef &&
    !resolved.photoUrl &&
    !resolved.photoIngredientId &&
    brandIdentityDefaults.defaultAvatarIngredientId
  ) {
    resolved.photoIngredientId = String(
      brandIdentityDefaults.defaultAvatarIngredientId,
    );
  }

  if (
    !params.avatarId &&
    !params.avatarRef &&
    !resolved.avatarRef &&
    !resolved.photoUrl &&
    !resolved.photoIngredientId &&
    brandIdentityDefaults.defaultAvatarPhotoUrl
  ) {
    resolved.photoUrl = brandIdentityDefaults.defaultAvatarPhotoUrl;
  }

  if (
    !params.avatarId &&
    !params.avatarRef &&
    !resolved.avatarRef &&
    !resolved.photoUrl &&
    !resolved.photoIngredientId &&
    organizationIdentityDefaults.defaultAvatarIngredientId
  ) {
    resolved.photoIngredientId = String(
      organizationIdentityDefaults.defaultAvatarIngredientId,
    );
  }

  if (
    !params.avatarId &&
    !params.avatarRef &&
    !resolved.avatarRef &&
    !resolved.photoUrl &&
    !resolved.photoIngredientId &&
    organizationIdentityDefaults.defaultAvatarPhotoUrl
  ) {
    resolved.photoUrl = organizationIdentityDefaults.defaultAvatarPhotoUrl;
  }
}

async function applyVoiceDefaults(
  params: AvatarVideoGenerationParams,
  context: AvatarVideoGenerationContext,
  resolved: ResolvedIdentity,
  brandIdentityDefaults: AvatarIdentityDefaults,
  organizationIdentityDefaults: AvatarIdentityDefaults,
  deps: AvatarIdentityResolutionDependencies,
): Promise<ResolvedIdentity> {
  if (
    !resolved.audioUrl &&
    !resolved.audioIngredientId &&
    !resolved.elevenlabsVoiceId &&
    !resolved.heygenVoiceId &&
    !resolved.savedVoice &&
    brandIdentityDefaults.defaultVoiceRef
  ) {
    const resolvedBrandDefaultVoice = await deps.resolveSavedVoiceRef(
      brandIdentityDefaults.defaultVoiceRef,
      context.organizationId,
      params.text,
    );
    resolved.audioUrl = resolvedBrandDefaultVoice.audioUrl;
    resolved.elevenlabsVoiceId =
      resolvedBrandDefaultVoice.elevenlabsVoiceId ?? resolved.elevenlabsVoiceId;
    resolved.heygenVoiceId =
      resolvedBrandDefaultVoice.heygenVoiceId ?? resolved.heygenVoiceId;
    resolved.savedVoice =
      resolvedBrandDefaultVoice.savedVoice ?? resolved.savedVoice;
    resolved.voiceRef = resolvedBrandDefaultVoice.voiceRef ?? resolved.voiceRef;
  }

  if (
    !resolved.audioUrl &&
    !resolved.audioIngredientId &&
    !resolved.elevenlabsVoiceId &&
    !resolved.heygenVoiceId &&
    !resolved.savedVoice &&
    brandIdentityDefaults.defaultVoiceId
  ) {
    const brandVoice = await deps.findVoiceById(
      brandIdentityDefaults.defaultVoiceId.toString(),
      context.organizationId,
    );
    if (brandVoice) {
      const resolvedBrandVoice = deps.resolveVoiceLookup(brandVoice);
      resolved.audioUrl = resolvedBrandVoice.audioUrl;
      resolved.elevenlabsVoiceId =
        resolvedBrandVoice.elevenlabsVoiceId ?? resolved.elevenlabsVoiceId;
      resolved.heygenVoiceId =
        resolvedBrandVoice.heygenVoiceId ?? resolved.heygenVoiceId;
      resolved.savedVoice =
        resolvedBrandVoice.savedVoice ?? resolved.savedVoice;
    }
  }

  if (
    !resolved.audioUrl &&
    !resolved.audioIngredientId &&
    !resolved.elevenlabsVoiceId &&
    !resolved.heygenVoiceId &&
    !resolved.savedVoice &&
    organizationIdentityDefaults.defaultVoiceRef
  ) {
    const resolvedOrganizationDefaultVoice = await deps.resolveSavedVoiceRef(
      organizationIdentityDefaults.defaultVoiceRef,
      context.organizationId,
      params.text,
    );
    resolved.audioUrl = resolvedOrganizationDefaultVoice.audioUrl;
    resolved.elevenlabsVoiceId =
      resolvedOrganizationDefaultVoice.elevenlabsVoiceId ??
      resolved.elevenlabsVoiceId;
    resolved.heygenVoiceId =
      resolvedOrganizationDefaultVoice.heygenVoiceId ?? resolved.heygenVoiceId;
    resolved.savedVoice =
      resolvedOrganizationDefaultVoice.savedVoice ?? resolved.savedVoice;
    resolved.voiceRef =
      resolvedOrganizationDefaultVoice.voiceRef ?? resolved.voiceRef;
  }

  if (
    !resolved.audioUrl &&
    !resolved.audioIngredientId &&
    !resolved.elevenlabsVoiceId &&
    !resolved.heygenVoiceId &&
    !resolved.savedVoice &&
    organizationIdentityDefaults.defaultVoiceId
  ) {
    const organizationVoice = await deps.findVoiceById(
      organizationIdentityDefaults.defaultVoiceId.toString(),
      context.organizationId,
    );
    if (organizationVoice) {
      const resolvedOrganizationVoice =
        deps.resolveVoiceLookup(organizationVoice);
      resolved.audioUrl = resolvedOrganizationVoice.audioUrl;
      resolved.elevenlabsVoiceId =
        resolvedOrganizationVoice.elevenlabsVoiceId ??
        resolved.elevenlabsVoiceId;
      resolved.heygenVoiceId =
        resolvedOrganizationVoice.heygenVoiceId ?? resolved.heygenVoiceId;
      resolved.savedVoice =
        resolvedOrganizationVoice.savedVoice ?? resolved.savedVoice;
    }
  }

  return resolved;
}
