import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { generateLabel } from '@api/shared/utils/label/label.util';
import {
  AssetScope,
  FileInputType,
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import { IngredientSerializer } from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Optional, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
@OrganizationModule('playground')
export class VideosGifController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly fileQueueService: FileQueueService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    @Optional()
    private readonly authorizedMediaUrls?: AuthorizedMediaUrlService,
  ) {}

  private async processingVideoUrl(
    organizationId: string,
    videoId: string,
  ): Promise<string> {
    if (!this.configService.isAuthorizedMediaDeliveryEnabled) {
      return `${this.configService.ingredientsEndpoint}/videos/${videoId}`;
    }
    if (!this.authorizedMediaUrls)
      throw new Error('Authorized media issuer is unavailable');
    const urls = await this.authorizedMediaUrls.issueServerPublish(
      organizationId,
      [videoId],
    );
    const url = urls.get(videoId);
    if (!url) throw new Error('The source video has no authorized media URL');
    return url;
  }

  @Post(':videoId/gif')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createGif(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
  ) {
    const video = await this.videosService.findOne({
      id: videoId,
      isDeleted: false,
      organizationId: user.organizationId,
    });
    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    const jobResponse = await this.fileQueueService.createGif(
      videoId,
      await this.processingVideoUrl(user.organizationId.toString(), videoId),
      { fps: 10, width: 480 },
    );

    const { ingredientData, metadataData } =
      await this.sharedService.createMediaDocuments(user, {
        origin: IngredientOrigin.GENERATED,
        // The GIF belongs with its source video, so it lands in that brand's
        // Library and Generate gallery linked back to it.
        brandId: video.brandId ?? user.brandId,
        category: IngredientCategory.GIF,
        extension: MetadataExtension.GIF,
        externalId: jobResponse.jobId,
        externalProvider: 'video-to-gif',
        label: generateLabel(),
        parentId: videoId,
        scope: AssetScope.USER,
        status: IngredientStatus.PROCESSING,
      });

    this.fileQueueService
      .waitForJob(jobResponse.jobId, 60000)
      .then(async (result) => {
        const uploaded = await this.filesClientService.uploadToS3(
          ingredientData.id,
          `gifs`,
          {
            path: String(result.outputPath ?? ''),
            type: FileInputType.FILE,
          },
        );

        await this.ingredientsService.patch(ingredientData.id, {
          ...(uploaded.s3Key ? { s3Key: uploaded.s3Key } : {}),
          status: IngredientStatus.GENERATED,
        });

        await this.metadataService.patch(
          metadataData.id,
          new MetadataEntity(result),
        );
      })
      .catch((error: unknown) => {
        this.loggerService.error('error uploading video', error);
      });

    return serializeSingle(request, IngredientSerializer, ingredientData);
  }
}
