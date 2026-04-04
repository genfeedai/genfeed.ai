/**
 * Videos Upload Controller
 * Handles video upload operations:
 * - Upload video files directly
 */

import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ValidationConfigService } from '@api/config/services/validation.config';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import { IngredientUploadSerializer } from '@genfeedai/serializers';
import {
  AssetScope,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { Types } from 'mongoose';

@AutoSwagger()
@Controller('videos')
@UseGuards(RolesGuard)
export class VideosUploadController {
  constructor(
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly sharedService: SharedService,
    private readonly validationConfigService: ValidationConfigService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max for videos
      },
    }),
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createUpload(
    @Req() request: Request,
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const validatedFile = InputValidationUtil.validateFileUpload(file, 'file', {
      allowedExtensions:
        this.validationConfigService.getAllowedVideoExtensions(),
      allowedMimeTypes: this.validationConfigService.getAllowedVideoMimeTypes(),
      required: true,
      validationConfig: this.validationConfigService,
    });

    if (!validatedFile) {
      throw new HttpException(
        {
          detail: 'Video file is required',
          title: 'File validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { ingredientData, metadataData } =
      await this.sharedService.saveDocuments(user, {
        brand: new Types.ObjectId(publicMetadata.brand),
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        label: validatedFile.originalname,
        organization: new Types.ObjectId(publicMetadata.organization),
        scope: AssetScope.USER,
        status: IngredientStatus.PROCESSING,
      });

    const videoId = ingredientData._id;
    await this.websocketService.publishIngredientStatus(
      videoId,
      IngredientStatus.PROCESSING,
      publicMetadata.user,
      { result: videoId },
    );

    this.filesClientService
      .uploadToS3(videoId, `videos`, {
        contentType: validatedFile.mimetype || 'video/mp4',
        data: validatedFile.buffer,
        type: FileInputType.BUFFER,
      })
      .then(async (res) => {
        await this.ingredientsService.patch(
          ingredientData._id,
          new IngredientEntity({
            status: IngredientStatus.UPLOADED,
          }),
        );

        await this.metadataService.patch(
          metadataData._id,
          new MetadataEntity(res),
        );
      })
      .catch((error: unknown) => {
        this.loggerService.error('error uploading video', error);
      });

    return serializeSingle(request, IngredientUploadSerializer, ingredientData);
  }
}
