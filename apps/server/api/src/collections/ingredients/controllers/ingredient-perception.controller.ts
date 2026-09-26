import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import { MediaModerationService } from '@api/services/moderation/media-moderation.service';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import {
  MediaModerationSerializer,
  MediaPerceptionSerializer,
} from '@genfeedai/serializers';
import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Read access to an asset's media validation records: perception (#4879 —
 * sampled frames, OCR text, transcript, scene description) and moderation
 * (#4880 — per-input category scores and verdict). Both are operational
 * data, so they are scoped to the caller's organization even for public
 * assets.
 */
@AutoSwagger()
@Controller('ingredients')
@UseGuards(RolesGuard)
export class IngredientPerceptionController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly mediaPerceptionService: MediaPerceptionService,
    private readonly mediaModerationService: MediaModerationService,
  ) {}

  @Get(':ingredientId/perception')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findPerception(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('ingredientId') ingredientId: string,
  ): Promise<JsonApiSingleResponse> {
    const { organizationId } = extractRequestContext(user);
    const perception = organizationId
      ? await this.mediaPerceptionService.getForAsset(
          organizationId,
          ingredientId,
        )
      : null;
    if (!perception) {
      return returnNotFound(this.constructorName, ingredientId);
    }
    return serializeSingle(request, MediaPerceptionSerializer, perception);
  }

  @Get(':ingredientId/moderation')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findModeration(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('ingredientId') ingredientId: string,
  ): Promise<JsonApiSingleResponse> {
    const { organizationId } = extractRequestContext(user);
    const moderation = organizationId
      ? await this.mediaModerationService.getForAsset(
          organizationId,
          ingredientId,
        )
      : null;
    if (!moderation) {
      return returnNotFound(this.constructorName, ingredientId);
    }
    return serializeSingle(request, MediaModerationSerializer, moderation);
  }
}
