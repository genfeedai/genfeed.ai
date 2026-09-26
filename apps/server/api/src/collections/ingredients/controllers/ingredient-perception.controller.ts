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
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { MediaPerceptionSerializer } from '@genfeedai/serializers';
import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Read access to an asset's media perception record (#4879): sampled frames,
 * OCR text, transcript and scene description. Perception is operational data,
 * so it is scoped to the caller's organization even for public assets.
 */
@AutoSwagger()
@Controller('ingredients')
@UseGuards(RolesGuard)
export class IngredientPerceptionController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly mediaPerceptionService: MediaPerceptionService,
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
}
