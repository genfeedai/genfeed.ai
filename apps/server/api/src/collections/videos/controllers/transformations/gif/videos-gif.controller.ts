import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { generateLabel } from '@api/shared/utils/label/label.util';
import type { User } from '@clerk/backend';
import {
  AssetScope,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
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
  ) {}

  @Post(':videoId/gif')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createGif(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
  ) {
    const video = await this.videosService.findOne({ _id: videoId });
    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    const jobResponse = await this.fileQueueService.createGif(
      videoId,
      `${this.configService.ingredientsEndpoint}/videos/${videoId}`,
      { fps: 10, width: 480 },
    );

    const { ingredientData, metadataData } =
      await this.sharedService.saveDocuments(user, {
        category: IngredientCategory.GIF,
        extension: MetadataExtension.GIF,
        label: generateLabel(),
        metadata: {
          jobId: jobResponse.jobId,
          jobType: 'video-to-gif',
        },
        scope: AssetScope.USER,
        status: IngredientStatus.PROCESSING,
      });

    this.fileQueueService
      .waitForJob(jobResponse.jobId, 60000)
      .then(async (result) => {
        await this.filesClientService.uploadToS3(ingredientData._id, `gifs`, {
          path: result.outputPath,
          type: FileInputType.FILE,
        });

        await this.ingredientsService.patch(
          ingredientData._id,
          new IngredientEntity({
            status: IngredientStatus.GENERATED,
          }),
        );

        await this.metadataService.patch(
          metadataData._id,
          new MetadataEntity(result),
        );
      })
      .catch((error: unknown) => {
        this.loggerService.error('error uploading video', error);
      });

    return serializeSingle(request, IngredientSerializer, ingredientData);
  }

  @Post(':videoId/reference')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createReference(
    @CurrentUser() _user: User,
    @Param('videoId') videoId: string,
  ) {
    const video = await this.videosService.findOne({ _id: videoId });
    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    return {
      message: 'Reference image generation endpoint',
      videoId: videoId,
    };
  }
}
