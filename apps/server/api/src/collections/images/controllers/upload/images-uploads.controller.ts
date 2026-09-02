/**
 * Images Uploads Controller
 * Handles all image upload operations:
 * - Upload image files
 * - Upload NFT images
 * - Generate presigned URLs for direct S3 uploads
 * - Confirm completed uploads
 */

import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { UploadImageDto } from '@api/collections/images/dto/upload-image.dto';
import { UploadNftDto } from '@api/collections/images/dto/upload-nft.dto';
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
import {
  AssetScope,
  categoryToPlural,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import {
  IngredientSerializer,
  IngredientUploadSerializer,
  PresignedUploadSerializer,
} from '@genfeedai/serializers';
import { ValidationConfigService } from '@libs/config/services/validation.config';
import { LoggerService } from '@libs/logger/logger.service';
import { resolveContainedPath } from '@libs/security';
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
import { diskStorage } from 'multer';
import { firstValueFrom } from 'rxjs';

const LARGE_MEDIA_BYTES = 1 * 1024 * 1024;
const IMAGE_UPLOAD_TMP_ROOT = path.join(tmpdir(), 'genfeed-image-uploads');
const createBadRequest = (message: string) => new BadRequestException(message);

function imageUploadDiskStorage() {
  return diskStorage({
    destination: (_request, _file, callback) => {
      if (!existsSync(IMAGE_UPLOAD_TMP_ROOT)) {
        mkdirSync(IMAGE_UPLOAD_TMP_ROOT, { recursive: true });
      }
      callback(null, IMAGE_UPLOAD_TMP_ROOT);
    },
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname || '').slice(0, 16);
      callback(null, `${randomUUID()}${extension}`);
    },
  });
}

function unlinkImageUploadTemp(filePath: string | undefined): void {
  if (!filePath) {
    return;
  }
  try {
    const containedPath = resolveContainedPath(
      IMAGE_UPLOAD_TMP_ROOT,
      filePath,
      createBadRequest,
    );
    if (existsSync(containedPath)) {
      unlinkSync(
        /* lgtm[js/path-injection] contained via resolveContainedPath */
        containedPath,
      );
    }
  } catch {
    // Temp cleanup must not mask the upload result.
  }
}

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

  private async transferUploadedMedia(params: {
    contentType: string;
    file: Express.Multer.File;
    folder: string;
    key: string;
  }): Promise<void> {
    const source = params.file.path
      ? createReadStream(
          /* lgtm[js/path-injection] contained via resolveContainedPath */
          resolveContainedPath(
            IMAGE_UPLOAD_TMP_ROOT,
            params.file.path,
            createBadRequest,
          ),
        )
      : params.file.buffer;

    if (!source) {
      throw new HttpException(
        {
          detail: 'File is required',
          title: 'File validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const isLargeMedia = params.file.size >= LARGE_MEDIA_BYTES;
    if (isLargeMedia) {
      const presigned = await this.filesClientService.getPresignedUploadUrl(
        params.key,
        params.folder,
        params.contentType,
      );
      if (presigned.uploadMethod !== 'POST_JSON') {
        await this.filesClientService.putStreamToUrl(
          presigned.uploadUrl,
          source,
          params.contentType,
        );
        await this.filesClientService.uploadToS3(params.key, params.folder, {
          type: FileInputType.URL,
          url: presigned.publicUrl,
        });
        return;
      }
    }

    await this.filesClientService.uploadStreamToS3(params.key, params.folder, {
      contentType: params.contentType,
      data: source,
      filename: params.file.originalname || 'upload',
    });
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
      storage: imageUploadDiskStorage(),
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

    const { ingredientData } = await this.sharedService.createMediaDocuments(
      user,
      {
        category,
        extension,
        label: validatedFile.originalname,
        scope: AssetScope.USER,
        status: IngredientStatus.UPLOADED,
      },
    );

    const folder = categoryToPlural(category);
    const resolvedContentType = validatedFile.mimetype || contentType;

    try {
      await this.transferUploadedMedia({
        contentType: resolvedContentType,
        file: validatedFile,
        folder,
        key: ingredientData.id,
      });
    } finally {
      unlinkImageUploadTemp(validatedFile.path);
    }

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

    const { ingredientData } = await this.sharedService.createMediaDocuments(
      user,
      {
        category: IngredientCategory.IMAGE,
        extension: contentType.split('/').pop() || 'jpg',
        label: nft.name || address,
        scope: AssetScope.USER,
        status: IngredientStatus.UPLOADED,
      },
    );

    await this.filesClientService.uploadToS3(ingredientData.id, 'images', {
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
    const websocketUrl = WebSocketPaths.image(ingredient.id.toString());
    await this.websocketService.publishVideoComplete(
      websocketUrl,
      // @ts-expect-error TS2345
      ingredient.id.toString(),
      user.id,
      getUserRoomName(user.id),
    );

    return serializeSingle(request, IngredientSerializer, ingredient);
  }
}
