import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { categoryToPlural } from '@api/helpers/utils/category-conversion/category-conversion.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileInputType, IngredientCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MediaUploadService {
  private readonly logContext = 'MediaUploadService';

  constructor(
    private readonly filesClientService: FilesClientService,
    private readonly metadataService: MetadataService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Uploads media to S3 and updates metadata with dimensions/size.
   * Validates width/height to prevent invalid dimensions that cause frontend issues.
   */
  async uploadAndUpdateMetadata(
    ingredientId: string,
    category: IngredientCategory | string,
    url: string,
    metadataId: string,
    externalId?: string,
  ): Promise<void> {
    const uploadMeta = await this.filesClientService.uploadToS3(
      ingredientId,
      categoryToPlural(category),
      { type: FileInputType.URL, url },
    );

    const updateData: Partial<Record<string, unknown>> = {
      duration: uploadMeta.duration,
      hasAudio: uploadMeta.hasAudio,
      size: uploadMeta.size,
    };

    if (uploadMeta.width && uploadMeta.width > 0) {
      updateData.width = uploadMeta.width;
    }
    if (uploadMeta.height && uploadMeta.height > 0) {
      updateData.height = uploadMeta.height;
    }

    if (
      !uploadMeta.width ||
      uploadMeta.width <= 0 ||
      !uploadMeta.height ||
      uploadMeta.height <= 0
    ) {
      this.loggerService.warn(
        `${this.logContext} media dimensions not extracted`,
        {
          externalId,
          ingredientId,
          uploadMeta,
          url,
        },
      );
    }

    await this.metadataService.patch(metadataId, updateData);
  }
}
