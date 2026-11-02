import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  assertPresignedUploadAllowed,
  isAudioCategory,
  isImageOrVideoCategory,
  resolveDirectUploadCategory,
  resolveUploadMaxBytes,
} from '@api/services/uploads/presigned-upload-policy.util';
import { resolveUploadExtension } from '@api/services/uploads/upload-extension.util';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import {
  AssetScope,
  categoryToPlural,
  FileInputType,
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  normalizeCategory,
} from '@genfeedai/contracts';
import type { IFileMetadata } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export interface PresignedUploadOptions {
  /** Trusted internal callers (for example clip sources) may raise the cap. */
  maxBytes?: number;
}

@Injectable()
export class PresignedUploadService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly filesClientService: FilesClientService,
    private readonly sharedService: SharedService,
    private readonly ingredientsService: IngredientsService,
    private readonly metadataService: MetadataService,
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {}

  async getPresignedUploadUrl(
    user: User,
    body: {
      filename: string;
      contentType: string;
      category?: IngredientCategory;
      /** Exact size in bytes; checked against the cap and signed into the URL. */
      sizeBytes?: number;
    },
    options: PresignedUploadOptions = {},
  ): Promise<{
    id: string;
    uploadUrl: string;
    publicUrl: string;
    s3Key: string;
    expiresIn: number;
    uploadMethod: 'POST_JSON' | 'PUT';
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const category = resolveDirectUploadCategory(
      body.category,
      body.contentType,
    );
    // Reject before any ingredient exists or any grant is signed.
    const contentType = assertPresignedUploadAllowed({
      category,
      contentType: body.contentType,
      maxBytesOverride: options.maxBytes,
      sizeBytes: body.sizeBytes,
    });
    const fileExtension = resolveUploadExtension(contentType, body.filename);

    // Pre-create the ingredient document with pending status
    const { ingredientData } = await this.sharedService.createMediaDocuments(
      user,
      {
        origin: IngredientOrigin.UPLOADED,
        category: CategoryPrismaUtil.toIngredientCategory(category),
        extension: fileExtension,
        label: body.filename,
        scope: AssetScope.USER,
        status: IngredientStatus.PROCESSING,
      },
    );

    this.loggerService.log(`${url} created ingredient`, {
      brandId: ingredientData.brandId,
      category: ingredientData.category,
      id: ingredientData.id,
      status: ingredientData.status,
      userId: ingredientData.userId,
    });

    const ingredientId = ingredientData.id.toString();
    const key =
      isSelfHostedDeployment() ||
      !this.configService.isAuthorizedMediaDeliveryEnabled
        ? ingredientId
        : randomUUID();

    // Get presigned URL from AWS service
    const presigned = await this.filesClientService.getPresignedUploadUrl(
      key,
      categoryToPlural(category),
      contentType,
      3600, // 1 hour expiry
      body.sizeBytes,
    );

    if (!presigned.s3Key?.trim()) {
      throw new HttpException(
        'Files service returned no storage key',
        HttpStatus.BAD_GATEWAY,
      );
    }

    await this.ingredientsService.patch(ingredientId, {
      s3Key: presigned.s3Key,
    });

    return {
      expiresIn: 3600,
      id: ingredientData.id.toString(),
      publicUrl: presigned.publicUrl,
      s3Key: presigned.s3Key,
      uploadMethod: presigned.uploadMethod ?? 'PUT',
      uploadUrl: presigned.uploadUrl,
    };
  }

  async confirmUpload(
    user: User,
    id: string,
    options: PresignedUploadOptions = {},
  ): Promise<IngredientDocument> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    // Find and update the ingredient status
    const ingredient = await this.ingredientsService.findOne(
      {
        id: id,
        isDeleted: false,
        organizationId: user.organizationId,
        status: IngredientStatus.PROCESSING,
        userId: user.userId ?? user.id,
      },
      [{ path: 'metadata' }],
    );

    if (!ingredient) {
      throw new HttpException(
        {
          detail: 'No pending upload found with this ID',
          title: 'Upload not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Extract metadata from the uploaded file
    // Use the same workflow as AI-generated content
    // ingredient.category is Prisma SCREAMING_SNAKE (e.g. 'VIDEO'); the S3
    // folder convention is lowercase plural (e.g. 'videos').
    const category = normalizeCategory(
      ingredient.category || IngredientCategory.IMAGE,
    );
    const s3Type = categoryToPlural(category);
    const s3Key = ingredient.s3Key;
    const keyPrefix = `ingredients/${s3Type}/`;
    if (!s3Key?.startsWith(keyPrefix) || s3Key === keyPrefix) {
      await this.ingredientsService.patch(id, {
        status: IngredientStatus.FAILED,
      });
      throw new HttpException(
        'The pending upload has no valid stored object key',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    let uploadMeta: IFileMetadata | undefined;
    try {
      // Get presigned download URL
      const downloadUrl =
        await this.filesClientService.getPresignedDownloadUrlForObjectKey(
          s3Key,
        );

      // Re-process the file through uploadToS3 to extract metadata
      // This uses the same workflow as AI-generated images/videos
      uploadMeta = await this.filesClientService.uploadToExistingObject(
        s3Key,
        s3Type,
        {
          type: FileInputType.URL,
          url: downloadUrl,
        },
      );
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to extract metadata`, undefined, {
        error: {
          message: (error as Error)?.message,
          name: (error as Error)?.name,
          stack: (error as Error)?.stack,
        },
      });
      await this.rejectUpload(id, s3Key);
      throw new HttpException(
        {
          detail:
            'The uploaded file could not be read as valid media. Upload a supported, uncorrupted file.',
          title: 'Upload could not be processed',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (
      !uploadMeta ||
      (isImageOrVideoCategory(category) &&
        !(Number(uploadMeta.width) > 0 && Number(uploadMeta.height) > 0)) ||
      (isAudioCategory(category) && uploadMeta.hasAudio !== true)
    ) {
      this.loggerService.error(`${url} extracted no usable metadata`);
      await this.rejectUpload(id, s3Key);
      throw new HttpException(
        {
          detail: isAudioCategory(category)
            ? 'The uploaded file has no readable audio.'
            : 'The uploaded file has no readable dimensions.',
          title: 'Upload could not be processed',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Backstop for uploads whose declared size was never signed into the URL.
    const maxBytes = resolveUploadMaxBytes(category, options.maxBytes);
    if (
      maxBytes !== undefined &&
      typeof uploadMeta.size === 'number' &&
      uploadMeta.size > maxBytes
    ) {
      await this.rejectUpload(id, s3Key);
      throw new HttpException(
        {
          detail: `The uploaded file exceeds the ${maxBytes} byte limit.`,
          title: 'Upload too large',
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    // Update metadata document with extracted dimensions
    if (ingredient.metadataId) {
      await this.metadataService.patch(ingredient.metadataId, {
        duration: uploadMeta.duration,
        hasAudio: uploadMeta.hasAudio,
        height: uploadMeta.height,
        size: uploadMeta.size,
        width: uploadMeta.width,
      });
    }

    this.loggerService.log(`${url} metadata extracted`, uploadMeta);

    // Update status to uploaded
    return await this.ingredientsService.patch(id, {
      s3Key,
      status: IngredientStatus.UPLOADED,
    });
  }

  /** Marks a rejected upload failed and removes the stored object best-effort. */
  private async rejectUpload(id: string, s3Key: string): Promise<void> {
    try {
      await this.ingredientsService.patch(id, {
        status: IngredientStatus.FAILED,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} failed to mark upload ${id} failed`,
        error,
      );
    }
    try {
      await this.filesClientService.deleteStoredObject(s3Key);
    } catch {
      // FilesClientService already logged the failure; the ingredient is FAILED.
    }
  }
}
