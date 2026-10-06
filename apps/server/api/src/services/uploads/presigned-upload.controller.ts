/**
 * Presigned upload routes for library bases other than `images`.
 * The shipped client posts `{base}/upload/presigned`. The references shelf
 * uses the `ingredients` base.
 */
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PresignedUploadDto } from '@api/collections/images/dto/presigned-upload.dto';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import {
  IngredientSerializer,
  PresignedUploadSerializer,
} from '@genfeedai/serializers';
import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

export const PRESIGNED_UPLOAD_CONTROLLER_PATHS = [
  'audios',
  'avatars',
  'gifs',
  'ingredients',
  'musics',
  'videos',
  'voices',
] as const;

@AutoSwagger('uploads')
@Controller([...PRESIGNED_UPLOAD_CONTROLLER_PATHS])
export class PresignedUploadController {
  constructor(
    private readonly presignedUploadService: PresignedUploadService,
  ) {}

  @Post('upload/presigned')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generatePresignedUrl(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: PresignedUploadDto,
  ): Promise<JsonApiSingleResponse> {
    const result = await this.presignedUploadService.getPresignedUploadUrl(
      user,
      body,
    );

    return serializeSingle(request, PresignedUploadSerializer, result);
  }

  @Post('upload/confirm/:id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async confirmUpload(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const ingredient = await this.presignedUploadService.confirmUpload(
      user,
      id,
    );

    return serializeSingle(request, IngredientSerializer, ingredient);
  }
}
