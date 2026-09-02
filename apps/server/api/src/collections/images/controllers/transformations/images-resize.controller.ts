import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ImageResizeService } from '@api/collections/images/services/image-resize.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type {
  IResizeBodyParams,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@Controller('images')
@UseInterceptors(CreditsInterceptor)
export class ImagesResizeController {
  constructor(
    readonly loggerService: LoggerService,
    private readonly imageResizeService: ImageResizeService,
  ) {}

  @Post(':imageId/resize')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'ImagesTransformationsController.resizeImage',
    summary: 'resizeImage',
  })
  async resizeImage(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('imageId') imageId: string,
    @Body() body: IResizeBodyParams,
  ): Promise<JsonApiSingleResponse> {
    const resizedImage = await this.imageResizeService.resizeImage(
      imageId,
      user,
      body,
    );

    return serializeSingle(request, IngredientSerializer, resizedImage);
  }
}
