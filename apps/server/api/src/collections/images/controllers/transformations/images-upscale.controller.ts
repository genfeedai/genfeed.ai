import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ImageEditDto } from '@api/collections/images/dto/image-edit.dto';
import { ImageUpscaleService } from '@api/collections/images/services/image-upscale.service';
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
export class ImagesUpscaleController {
  constructor(
    readonly loggerService: LoggerService,
    private readonly imageUpscaleService: ImageUpscaleService,
  ) {}

  @Post(':imageId/upscale')
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @Credits({
    description: 'Image upscaling',
    modelKey: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
    source: ActivitySource.IMAGE_UPSCALE,
  })
  @ValidateModel({ category: ModelCategory.IMAGE_EDIT })
  @ApiOperation({
    operationId: 'ImagesTransformationsController.upscaleImage',
    summary: 'upscaleImage',
  })
  async upscaleImage(
    @Req() request: Request,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
    @Body() imageEditDto: ImageEditDto,
  ): Promise<JsonApiSingleResponse> {
    const upscaledImage = await this.imageUpscaleService.upscaleImage(
      request,
      imageId,
      user,
      imageEditDto,
    );

    return serializeSingle(request, IngredientSerializer, upscaledImage);
  }
}
