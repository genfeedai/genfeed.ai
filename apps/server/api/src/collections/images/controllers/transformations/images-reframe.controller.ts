import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageReframeService } from '@api/collections/images/services/image-reframe.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import {
  RateLimit,
  RateLimitPresets,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ActivitySource, ModelCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@Controller('images')
@UseInterceptors(CreditsInterceptor)
export class ImagesReframeController {
  constructor(
    readonly loggerService: LoggerService,
    private readonly imageReframeService: ImageReframeService,
  ) {}

  @Post(':imageId/reframe')
  @RateLimit(RateLimitPresets.external) // 30 requests per minute for AI generation
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @Credits({
    description: 'Image reframe',
    modelKey: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
    source: ActivitySource.IMAGE_REFRAME,
  })
  @ValidateModel({ category: ModelCategory.IMAGE_EDIT })
  @ApiOperation({
    operationId: 'ImagesTransformationsController.reframeImage',
    summary: 'reframeImage',
  })
  async reframeImage(
    @Req() request: Request,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
    @Body() createImageDto: CreateImageDto,
  ): Promise<JsonApiSingleResponse> {
    const reframedImage = await this.imageReframeService.reframeImage(
      request,
      imageId,
      user,
      createImageDto,
    );

    return serializeSingle(request, IngredientSerializer, reframedImage);
  }
}
