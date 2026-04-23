import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import {
  AssetScope,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class PresignedUploadService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly filesClientService: FilesClientService,
    private readonly sharedService: SharedService,
    private readonly ingredientsService: IngredientsService,
    private readonly metadataService: MetadataService,
    private readonly loggerService: LoggerService,
  ) {}

  async getPresignedUploadUrl(
    user: User,
    body: {
      filename: string;
      contentType: string;
      category?: IngredientCategory;
    },
  ): Promise<{
    _id: string;
    uploadUrl: string;
    publicUrl: string;
    s3Key: string;
    expiresIn: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const filenameParts = body.filename.split('.');
    const lastPart = filenameParts[filenameParts.length - 1];
    const fileExtension =
      filenameParts.length > 1 && lastPart ? lastPart : 'jpg';
    const category = body.category?.toLowerCase() || 'image';

    // Pre-create the ingredient document with pending status
    const { ingredientData } = await this.sharedService.saveDocuments(user, {
      category,
      extension: fileExtension,
      label: body.filename,
      scope: AssetScope.USER,
      status: IngredientStatus.PROCESSING,
    });

    this.loggerService.log(`${url} created ingredient`, {
      brand: ingredientData.brand,
      category: ingredientData.category,
      id: ingredientData._id,
      status: ingredientData.status,
      user: ingredientData.user,
    });

    // Generate key using ingredient ID
    const key = ingredientData._id.toString();

    // Get presigned URL from AWS service
    const { uploadUrl, publicUrl, s3Key } =
      await this.filesClientService.getPresignedUploadUrl(
        key,
        `${category}s`,
        body.contentType,
        3600, // 1 hour expiry
      );

    return {
      _id: ingredientData._id.toString(),
      expiresIn: 3600,
      publicUrl,
      s3Key,
      uploadUrl,
    };
  }

  async confirmUpload(user: User, id: string): Promise<IngredientDocument> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const publicMetadata = getPublicMetadata(user);

    // Find and update the ingredient status
    const ingredient = await this.ingredientsService.findOne(
      {
        _id: id,
        status: 'processing',
        user: publicMetadata.user,
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
    const category = ingredient.category || 'image';
    const s3Type = `${category}s`;

    try {
      // Get presigned download URL
      const downloadUrl = await this.filesClientService.getPresignedDownloadUrl(
        id,
        s3Type,
        300, // 5 minutes
      );

      // Re-process the file through uploadToS3 to extract metadata
      // This uses the same workflow as AI-generated images/videos
      const uploadMeta = await this.filesClientService.uploadToS3(id, s3Type, {
        type: FileInputType.URL,
        url: downloadUrl,
      });

      // Update metadata document with extracted dimensions
      if (ingredient.metadata && uploadMeta) {
        const metadataId =
          typeof ingredient.metadata === 'string'
            ? ingredient.metadata
            : ingredient.metadata._id;

        if (metadataId) {
          await this.metadataService.patch(metadataId, {
            duration: uploadMeta.duration,
            hasAudio: uploadMeta.hasAudio,
            height: uploadMeta.height,
            size: uploadMeta.size,
            width: uploadMeta.width,
          });
        }
      }

      this.loggerService.log(`${url} metadata extracted`, uploadMeta);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to extract metadata`, undefined, {
        error: {
          message: (error as Error)?.message,
          name: (error as Error)?.name,
          stack: (error as Error)?.stack,
        },
      });
      // Continue even if metadata extraction fails
    }

    // Update status to uploaded
    return await this.ingredientsService.patch(id, {
      status: IngredientStatus.UPLOADED,
    });
  }
}
