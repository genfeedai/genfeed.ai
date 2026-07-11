/**
 * Videos Upload Controller
 * Handles video upload operations:
 * - Upload video files directly
 */

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  AssetScope,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import { IngredientUploadSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import type { Request } from 'express';

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
    @UploadedFile(
      new UploadValidationPipe({
        allowedExtensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'],
        allowedMimeTypes: [
          'video/mp4',
          'video/avi',
          'video/quicktime',
          'video/x-matroska',
          'video/webm',
        ],
        maxSizeBytes: 100 * 1024 * 1024,
      }),
    )
    file: Express.Multer.File,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const validatedFile = file;

    const { ingredientData, metadataData } =
      await this.sharedService.saveDocuments(user, {
        brand: publicMetadata.brand,
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        label: validatedFile.originalname,
        organization: publicMetadata.organization,
        scope: AssetScope.USER,
        status: IngredientStatus.PROCESSING,
      });

    const videoId = ingredientData.id;
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
        await this.ingredientsService.patch(ingredientData.id, {
          status: IngredientStatus.UPLOADED,
        });

        await this.metadataService.patch(
          metadataData.id,
          new MetadataEntity(res),
        );
      })
      .catch((error: unknown) => {
        this.loggerService.error('error uploading video', error);
      });

    return serializeSingle(request, IngredientUploadSerializer, ingredientData);
  }
}
