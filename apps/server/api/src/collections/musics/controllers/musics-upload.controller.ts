import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
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
import type { Request } from 'express';

@AutoSwagger()
@Controller('musics')
@UseGuards(RolesGuard)
export class MusicsUploadController {
  constructor(
    private readonly filesClientService: FilesClientService,
    readonly _loggerService: LoggerService,
    readonly _metadataService: MetadataService,
    readonly _musicsService: MusicsService,
    private readonly sharedService: SharedService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max for audio files
      },
    }),
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createUpload(
    @Req() request: Request,
    @CurrentUser() user: User,
    @UploadedFile(
      new UploadValidationPipe({
        allowedExtensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'webm'],
        allowedMimeTypes: [
          'audio/mpeg',
          'audio/mp3',
          'audio/wav',
          'audio/aac',
          'audio/flac',
          'audio/ogg',
          'audio/webm',
        ],
        maxSizeBytes: 50 * 1024 * 1024,
      }),
    )
    file: Express.Multer.File,
  ) {
    const { ingredientData } = await this.sharedService.saveDocuments(user, {
      category: IngredientCategory.MUSIC,
      extension: MetadataExtension.MP3,
      label: file.originalname,
      scope: AssetScope.USER,
      status: IngredientStatus.UPLOADED,
    });

    await this.filesClientService.uploadToS3(ingredientData._id, `musics`, {
      contentType: file.mimetype || 'audio/mpeg',
      data: file.buffer,
      type: FileInputType.BUFFER,
    });

    return serializeSingle(request, IngredientUploadSerializer, ingredientData);
  }
}
