import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  type AgentIdentityDefaults,
  resolveEffectiveBrandAgentConfig,
} from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import {
  omitUnattachedStudioHandoffIdentity,
  pickStudioHandoffIdentityFields,
  readOptionalIdentityString,
  resolveStudioHandoffPayloadType,
  type StudioHandoffIdentityFields,
  shouldAttachStudioHandoffIdentity,
} from '@api/services/agent-orchestrator/agent-studio-handoff-identity.util';
import type {
  AgentStudioHandoffPayload,
  AgentStudioHandoffScope,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

/**
 * #4717: snapshots the brand's current identity into an Agent → Studio
 * handoff at create time. Consume never looks identity up again, so a later
 * brand-identity edit cannot silently rewrite what Studio opens with.
 *
 * Client-supplied `avatarPhotoUrl`/`voiceId` are ignored — only the brand
 * (then organization) identity for this organization is applied. A foreign
 * or unresolvable identity is omitted, never substituted.
 */
@Injectable()
export class AgentStudioHandoffIdentityService {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly ingredientsService: IngredientsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly voicesService: VoicesService,
  ) {}

  async attachIdentity(
    scope: AgentStudioHandoffScope,
    payload: AgentStudioHandoffPayload,
  ): Promise<AgentStudioHandoffPayload> {
    if (!shouldAttachStudioHandoffIdentity(payload.type, payload.useIdentity)) {
      return omitUnattachedStudioHandoffIdentity(payload);
    }

    const type = resolveStudioHandoffPayloadType(
      payload.type,
      payload.useIdentity,
    );
    const identity = await this.resolveBrandIdentity(scope, payload.brandId);
    const {
      avatarPhotoUrl: _clientAvatarPhotoUrl,
      voiceId: _clientVoiceId,
      ...rest
    } = payload;

    return {
      ...rest,
      ...identity,
      type,
      useIdentity: true,
    };
  }

  private async resolveBrandIdentity(
    scope: AgentStudioHandoffScope,
    brandId: string,
  ): Promise<StudioHandoffIdentityFields> {
    const [brand, organizationSettings] = await Promise.all([
      this.brandsService.findOne(
        {
          id: brandId,
          isDeleted: false,
          organizationId: scope.organizationId,
        },
        'none',
      ),
      this.organizationSettingsService.findOne({
        organizationId: scope.organizationId,
      }),
    ]);

    if (!brand) {
      return {};
    }

    const defaults = resolveEffectiveBrandAgentConfig({
      brand,
      organizationSettings,
    }).identityDefaults.effective;

    const [avatarPhotoUrl, voiceId] = await Promise.all([
      this.resolveAvatarPhotoUrl(defaults, scope.organizationId, brandId),
      this.resolveVoiceId(defaults, scope.organizationId, brandId),
    ]);

    return pickStudioHandoffIdentityFields({ avatarPhotoUrl, voiceId });
  }

  private async resolveAvatarPhotoUrl(
    defaults: AgentIdentityDefaults,
    organizationId: string,
    brandId: string,
  ): Promise<string | undefined> {
    const photoUrl = readOptionalIdentityString(defaults.defaultAvatarPhotoUrl);
    if (photoUrl) {
      return photoUrl;
    }

    const ingredientId = readOptionalIdentityString(
      defaults.defaultAvatarIngredientId,
    );
    if (!ingredientId) {
      return undefined;
    }

    const ingredient = await this.ingredientsService.findAvatarImageById(
      ingredientId,
      organizationId,
    );
    if (!ingredient || this.isForeignBrandAsset(ingredient.brandId, brandId)) {
      return undefined;
    }

    return readOptionalIdentityString(ingredient.cdnUrl);
  }

  private async resolveVoiceId(
    defaults: AgentIdentityDefaults,
    organizationId: string,
    brandId: string,
  ): Promise<string | undefined> {
    const refVoiceId = readOptionalIdentityString(
      defaults.defaultVoiceRef?.externalVoiceId,
    );
    if (refVoiceId) {
      return refVoiceId;
    }

    const voiceRowId =
      readOptionalIdentityString(defaults.defaultVoiceRef?.internalVoiceId) ??
      readOptionalIdentityString(defaults.defaultVoiceId);
    if (!voiceRowId) {
      return undefined;
    }

    const voice = await this.voicesService.findOne({
      id: voiceRowId,
      isDeleted: false,
      organizationId,
    });
    if (!voice || this.isForeignBrandAsset(voice.brandId, brandId)) {
      return undefined;
    }

    return readOptionalIdentityString(voice.externalVoiceId);
  }

  private isForeignBrandAsset(
    assetBrandId: unknown,
    handoffBrandId: string,
  ): boolean {
    const resolvedBrandId = readOptionalIdentityString(assetBrandId);
    return Boolean(resolvedBrandId && resolvedBrandId !== handoffBrandId);
  }
}
