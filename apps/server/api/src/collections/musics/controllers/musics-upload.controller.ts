import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { ValidationConfigService } from '@api/config/services/validation.config';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
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
    private readonly validationConfigService: ValidationConfigService,
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
    @UploadedFile() file: Express.Multer.File,
  ) {
    const validatedFile = InputValidationUtil.validateFileUpload(file, 'file', {
      allowedExtensions:
        this.validationConfigService.getAllowedAudioExtensions(),
      allowedMimeTypes: this.validationConfigService.getAllowedAudioMimeTypes(),
      required: true,
      validationConfig: this.validationConfigService,
    });

    if (!validatedFile) {
      throw new HttpException(
        {
          detail: 'Music file is required',
          title: 'File validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { ingredientData } = await this.sharedService.saveDocuments(user, {
      category: IngredientCategory.MUSIC,
      extension: MetadataExtension.MP3,
      label: validatedFile.originalname,
      scope: AssetScope.USER,
      status: IngredientStatus.UPLOADED,
    });

    await this.filesClientService.uploadToS3(ingredientData._id, `musics`, {
      contentType: validatedFile.mimetype || 'audio/mpeg',
      data: validatedFile.buffer,
      type: FileInputType.BUFFER,
    });

    return serializeSingle(request, IngredientUploadSerializer, ingredientData);
  }
}
