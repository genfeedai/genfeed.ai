import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { ImagesService } from '@server/collections/images/services/images.service';
import type { IngredientDocument } from '@server/collections/ingredients/schemas/ingredient.schema';
import { MetadataEntity } from '@server/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@server/collections/metadata/services/metadata.service';
import { CategoryPrismaUtil } from '@server/helpers/utils/category-prisma/category-prisma.util';
import { returnNotFound } from '@api/helpers/utils/response/response.util';
import { SharedService } from '@server/shared/services/shared/shared.service';
import {
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
} from '@genfeedai/enums';
import type { IResizeBodyParams } from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

const LEGACY_CONTROLLER_NAME = 'ImagesTransformationsController';

@Injectable()
export class ImageResizeService {
  constructor(
    private readonly configService: ConfigService,
    private readonly filesClientService: FilesClientService,
    private readonly imagesService: ImagesService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly sharedService: SharedService,
  ) {}

  async resizeImage(
    imageId: string,
    user: User,
    body: IResizeBodyParams,
  ): Promise<IngredientDocument> {
    const url = `${LEGACY_CONTROLLER_NAME} ${CallerUtil.getCallerName()}`;
    const image = await this.imagesService.findOne({
      id: imageId,
      userId: user.userId ?? user.id,
    });

    if (!image) {
      return returnNotFound(LEGACY_CONTROLLER_NAME, imageId);
    }

    try {
      const { metadataData, ingredientData } =
        await this.sharedService.createMediaDocuments(user, {
          brandId: user.brandId,
          category: CategoryPrismaUtil.toIngredientCategory(
            IngredientCategory.IMAGE,
          ),
          extension: MetadataExtension.JPG,
          organizationId: user.organizationId,
          parentId: imageId,
          status: IngredientStatus.PROCESSING,
        });

      const target = {
        height: body.height || 1920,
        width: body.width || 1080,
      };
      const imageUrl = `${this.configService.ingredientsEndpoint}/images/${imageId}`;
      const resizedImage = await this.filesClientService.resizeImageFromUrl(
        imageUrl,
        target,
      );
      const uploadMeta = await this.filesClientService.uploadToS3(
        ingredientData.id.toString(),
        'images',
        {
          contentType: 'image/jpeg',
          data: resizedImage,
          type: FileInputType.BUFFER,
        },
      );

      await this.metadataService.patch(
        metadataData.id,
        new MetadataEntity({
          height: uploadMeta.height ?? target.height,
          size: uploadMeta.size ?? resizedImage.length,
          width: uploadMeta.width ?? target.width,
        }),
      );

      const updatedIngredient = await this.imagesService.patch(
        ingredientData.id,
        {
          cdnUrl:
            typeof uploadMeta.publicUrl === 'string'
              ? uploadMeta.publicUrl
              : undefined,
          s3Key:
            typeof uploadMeta.s3Key === 'string' ? uploadMeta.s3Key : undefined,
          status: IngredientStatus.GENERATED,
          transformations: [TransformationCategory.RESIZED],
        },
      );

      return updatedIngredient || ingredientData;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
