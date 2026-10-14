import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import type {
  AvatarModelSelection,
  AvatarVideoGenerationParams,
} from '@api/collections/videos/services/avatar-video-generation.types';
import { RouterService } from '@api/services/router/router.service';
import { ModelCategory } from '@genfeedai/contracts';
import {
  getEligibleHeyGenAvatarModelKeys,
  getHeyGenAvatarEngine,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type { HeyGenAvatarRef } from '@genfeedai/contracts/interfaces';
import { isAutoStudioModelKey } from '@genfeedai/pricing';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Chooses the avatar engine row for a render. A trained look routes among the
 * engines it can render (Auto) or takes an explicit engine it supports. Photo
 * animation has no engine field on HeyGen's image request, so it is priced on
 * its own per-second `heygen/avatar` row.
 */
@Injectable()
export class AvatarVideoModelService {
  constructor(
    private readonly routerService: RouterService,
    private readonly modelRegistration: ModelRegistrationService,
  ) {}

  async resolve(
    params: Pick<
      AvatarVideoGenerationParams,
      'autoSelectModel' | 'model' | 'prioritize' | 'text'
    >,
    avatarRef: HeyGenAvatarRef | undefined,
    organizationId: string,
  ): Promise<AvatarModelSelection> {
    const explicit =
      params.autoSelectModel ||
      isAutoStudioModelKey(params.model) ||
      // The legacy flat key is not an engine choice; treat it as Auto.
      params.model === MODEL_KEYS.HEYGEN_AVATAR
        ? undefined
        : params.model;

    if (!avatarRef) {
      if (explicit === MODEL_KEYS.HEYGEN_AVATAR_V)
        throw new BadRequestException(
          'Avatar V needs a trained digital-twin look, not a photo.',
        );
      return { modelKey: MODEL_KEYS.HEYGEN_AVATAR };
    }

    const eligibleModelKeys = getEligibleHeyGenAvatarModelKeys(avatarRef);
    if (eligibleModelKeys.length === 0)
      throw new BadRequestException(
        'This look supports no HeyGen avatar engine Genfeed can price.',
      );

    let modelKey: string;
    if (explicit) {
      if (!eligibleModelKeys.includes(explicit))
        throw new BadRequestException(
          explicit === MODEL_KEYS.HEYGEN_AVATAR_V
            ? 'Avatar V needs a digital-twin look that supports the Avatar V engine.'
            : `${explicit} is not available for this avatar look.`,
        );
      modelKey = String(
        (
          await this.modelRegistration.validateModelForOrg(
            explicit,
            organizationId,
          )
        ).key,
      );
    } else {
      modelKey = (
        await this.routerService.selectModel({
          category: ModelCategory.AVATAR,
          eligibleModelKeys,
          organizationId,
          prioritize: params.prioritize ?? 'balanced',
          prompt: params.text || 'Avatar video',
        })
      ).selectedModel;
    }

    const engine = getHeyGenAvatarEngine(modelKey);
    if (!engine || !eligibleModelKeys.includes(modelKey))
      throw new BadRequestException(
        'The selected avatar engine is unavailable for this look.',
      );
    return {
      avatarType: avatarRef.avatarType ?? undefined,
      engine,
      modelKey,
    };
  }
}
