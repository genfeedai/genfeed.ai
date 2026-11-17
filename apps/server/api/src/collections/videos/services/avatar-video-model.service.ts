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
  HEYGEN_AVATAR_6_DEFAULT_RESOLUTION,
  isHeyGenAvatar6Engine,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type { HeyGenAvatarRef } from '@genfeedai/contracts/interfaces';
import { isAutoStudioModelKey } from '@genfeedai/pricing';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Chooses the avatar engine row for a render. A trained look routes among the
 * engines it can render (Auto) or takes an explicit engine it supports. Photo
 * animation has no engine field on HeyGen's image request, so it is priced on
 * its own per-second `heygen/avatar` row.
 */
@Traced()
@Injectable()
export class AvatarVideoModelService {
  constructor(
    private readonly routerService: RouterService,
    private readonly modelRegistration: ModelRegistrationService,
  ) {}

  async resolve(
    params: Pick<
      AvatarVideoGenerationParams,
      'autoSelectModel' | 'model' | 'prioritize' | 'resolution' | 'text'
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

    const resolution = params.resolution ?? HEYGEN_AVATAR_6_DEFAULT_RESOLUTION;
    const needs2k = resolution !== HEYGEN_AVATAR_6_DEFAULT_RESOLUTION;

    if (!avatarRef) {
      if (needs2k)
        throw new BadRequestException(
          '2K output needs a trained avatar look on Avatar 6, not a photo.',
        );
      if (explicit === MODEL_KEYS.HEYGEN_AVATAR_V)
        throw new BadRequestException(
          'Avatar V needs a trained digital-twin look, not a photo.',
        );
      if (
        explicit === MODEL_KEYS.HEYGEN_AVATAR_6 ||
        explicit === MODEL_KEYS.HEYGEN_AVATAR_6_TURBO
      )
        throw new BadRequestException(
          'Avatar 6 needs a trained avatar look, not a photo.',
        );
      return { modelKey: MODEL_KEYS.HEYGEN_AVATAR };
    }

    // 2K is an Avatar 6 and Turbo output; the other engines render at 1080p.
    const eligibleModelKeys = getEligibleHeyGenAvatarModelKeys(
      avatarRef,
    ).filter(
      (key) => !needs2k || isHeyGenAvatar6Engine(getHeyGenAvatarEngine(key)),
    );
    if (needs2k && eligibleModelKeys.length === 0)
      throw new BadRequestException(
        'This look does not support Avatar 6, which 2K output needs.',
      );
    if (eligibleModelKeys.length === 0)
      throw new BadRequestException(
        'This look supports no HeyGen avatar engine Genfeed can price.',
      );

    let modelKey: string;
    if (explicit) {
      if (!eligibleModelKeys.includes(explicit))
        throw new BadRequestException(
          needs2k
            ? '2K output needs Avatar 6 or Avatar 6 Turbo on a look that supports it.'
            : explicit === MODEL_KEYS.HEYGEN_AVATAR_V
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
      ...(isHeyGenAvatar6Engine(engine) ? { resolution } : {}),
    };
  }
}
