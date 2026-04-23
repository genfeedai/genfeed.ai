/**
 * Images Uploads Controller
 * Handles all image upload operations:
 * - Upload image files
 * - Upload NFT images
 * - Generate presigned URLs for direct S3 uploads
 * - Confirm completed uploads
 */

import { UploadImageDto } from '@api/collections/images/dto/upload-image.dto';
import { UploadNftDto } from '@api/collections/images/dto/upload-nft.dto';
import { ValidationConfigService } from '@api/config/services/validation.config';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { SolanaService } from '@api/services/integrations/solana/solana.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import {
  AssetScope,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import {
  IngredientSerializer,
  IngredientUploadSerializer,
  PresignedUploadSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';

/**
 * ImagesUploadsController
 * Specialized controller for handling image upload operations
 * Supports multiple upload methods: direct file upload, NFT uploads, and presigned URLs
 */
@AutoSwagger()
@Controller('images')
export class ImagesUploadsController {
  private normalizeContentTypeHeader(value: unknown, fallback: string): string {
    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return (
        value.find((entry): entry is string => typeof entry === 'string') ??
        fallback
      );
    }

    return fallback;
  }

  constructor(
    private readonly filesClientService: FilesClientService,
    private readonly httpService: HttpService,
    readonly _loggerService: LoggerService,
    private readonly presignedUploadService: PresignedUploadService,
    private readonly sharedService: SharedService,
    private readonly solanaService: SolanaService,
    private readonly validationConfigService: ValidationConfigService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size
      },
    }),
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async upload(
    @Req() request: Request,
    @CurrentUser() user: User,
    @UploadedFile()
    file: Express.Multer.File,
    @Body() uploadDto: UploadImageDto,
  ): Promise<JsonApiSingleResponse> {
    const category = uploadDto.category;

    // Validate file based on category
    let allowedMimeTypes: string[];
    let allowedExtensions: string[];
    let extension = 'jpg';
    let contentType = 'image/jpeg';

    switch (category) {
      case IngredientCategory.VOICE:
      case IngredientCategory.MUSIC:
        allowedMimeTypes =
          this.validationConfigService.getAllowedAudioMimeTypes();
        allowedExtensions =
          this.validationConfigService.getAllowedAudioExtensions();
        extension = 'mp3';
        contentType = 'audio/mpeg';
        break;

      case IngredientCategory.VIDEO:
        allowedMimeTypes =
          this.validationConfigService.getAllowedVideoMimeTypes();
        allowedExtensions =
          this.validationConfigService.getAllowedVideoExtensions();
        extension = MetadataExtension.MP4;
        contentType = 'video/mp4';
        break;
      default:
        allowedMimeTypes =
          this.validationConfigService.getAllowedImageMimeTypes();
        allowedExtensions =
          this.validationConfigService.getAllowedImageExtensions();
        extension = 'jpg';
        contentType = 'image/jpeg';
        break;
    }

    // Validate the uploaded file
    const validatedFile = InputValidationUtil.validateFileUpload(file, 'file', {
      allowedExtensions,
      allowedMimeTypes,
      required: true,
      validationConfig: this.validationConfigService,
    });

    if (!validatedFile) {
      throw new HttpException(
        {
          detail: 'File is required',
          title: 'File validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { ingredientData } = await this.sharedService.saveDocuments(user, {
      category,
      extension,
      label: validatedFile.originalname,
      scope: AssetScope.USER,
      status: IngredientStatus.UPLOADED,
    });

    await this.filesClientService.uploadToS3(
      ingredientData._id,
      `${category}s`,
      {
        contentType: validatedFile.mimetype || contentType,
        data: validatedFile.buffer,
        type: FileInputType.BUFFER,
      },
    );

    return serializeSingle(request, IngredientUploadSerializer, ingredientData);
  }

  @Post('upload/nft')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async uploadNFT(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() uploadNftDto: UploadNftDto,
  ): Promise<JsonApiSingleResponse> {
    const address = uploadNftDto.address;

    const nft = await this.solanaService.getNft(address);
    const res = await firstValueFrom(
      this.httpService.get(nft.image, { responseType: 'arraybuffer' }),
    );
    const contentType = this.normalizeContentTypeHeader(
      res.headers['content-type'],
      'image/jpeg',
    );

    if (!contentType.startsWith('image/')) {
      throw new BadRequestException('NFT is not an image');
    }

    const { ingredientData } = await this.sharedService.saveDocuments(user, {
      category: IngredientCategory.IMAGE,
      extension: contentType.split('/').pop() || 'jpg',
      label: nft.name || address,
      scope: AssetScope.USER,
      status: IngredientStatus.UPLOADED,
    });

    await this.filesClientService.uploadToS3(ingredientData._id, 'images', {
      contentType,
      data: Buffer.from(res.data),
      type: FileInputType.BUFFER,
    });

    return serializeSingle(request, IngredientUploadSerializer, ingredientData);
  }

  @Post('upload/presigned')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generatePresignedUrl(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body()
    body: {
      filename: string;
      contentType: string;
      category: IngredientCategory;
    },
  ): Promise<JsonApiSingleResponse> {
    const result = await this.presignedUploadService.getPresignedUploadUrl(
      user,
      body,
    );

    return serializeSingle(request, PresignedUploadSerializer, result);
  }

  @Post('upload/confirm/:imageId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async confirmUpload(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('imageId') imageId: string,
  ): Promise<JsonApiSingleResponse> {
    const ingredient = await this.presignedUploadService.confirmUpload(
      user,
      imageId,
    );

    // Emit websocket event for upload completion
    const websocketUrl = WebSocketPaths.image(ingredient._id.toString());
    await this.websocketService.publishVideoComplete(
      websocketUrl,
      // @ts-expect-error TS2345
      ingredient._id.toString(),
      user.id,
      getUserRoomName(user.id),
    );

    return serializeSingle(request, IngredientSerializer, ingredient);
  }
}
