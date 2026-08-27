import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@server/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { SplitImageDto } from '@api/collections/images/dto/split-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { ImagesService } from '@server/collections/images/services/images.service';
import type { IngredientMetadataDocument } from '@server/collections/ingredients/schemas/ingredient.schema';
import { CreateTagDto } from '@server/collections/tags/dto/create-tag.dto';
import { TagsService } from '@server/collections/tags/services/tags.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@server/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { isEntityId } from '@server/helpers/validation/entity-id.validator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { SharedService } from '@server/shared/services/shared/shared.service';
import { PopulatePatterns } from '@server/shared/utils/populate/populate.util';
import {
  ActivityKey,
  ActivitySource,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MemberRole,
  MetadataExtension,
  ModelCategory,
  TagCategory,
  TagKey,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  SetMetadata,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

import sharp from 'sharp';

@AutoSwagger()
@Controller('images')
@UseGuards(RolesGuard)
export class ImagesOperationsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly activitiesService: ActivitiesService,
    private readonly filesClientService: FilesClientService,
    private readonly imagesService: ImagesService,
    private readonly loggerService: LoggerService,
    private readonly sharedService: SharedService,
    private readonly tagsService: TagsService,
    private readonly imageGenerationService: ImageGenerationService,
  ) {}

  @Post()
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
  ])
  @Credits({
    description: 'Image generation',
    source: ActivitySource.IMAGE_GENERATION,
  })
  @DeferCreditsUntilModelResolution()
  @ValidateModel({ category: ModelCategory.IMAGE })
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @UseInterceptors(CreditsInterceptor)
  @RateLimit({ limit: 30, scope: 'organization', windowMs: 60 * 1000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @Body() createImageDto: CreateImageDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    return this.imageGenerationService.generateImage(
      user,
      createImageDto,
      request,
    );
  }

  /**
   * Split a contact sheet image into individual frames and save them as ingredients
   */
  @Post(':id/split')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
  ])
  @RateLimit({ limit: 10, scope: 'organization', windowMs: 60 * 1000 })
  @LogMethod({ logEnd: true, logError: true, logStart: true })
  async splitContactSheet(
    @Req() _request: Request,
    @Param('id') id: string,
    @Body() splitImageDto: SplitImageDto,
    @CurrentUser() user: User,
  ): Promise<{
    data: { frames: Array<{ id: string; url: string; index: number }> };
  }> {
    if (!isEntityId(id)) {
      throw new HttpException(
        {
          detail: 'The provided image ID is not valid',
          title: 'Invalid ID',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Fetch the source image with metadata populated
    const sourceImage = await this.imagesService.findOne(
      {
        id: id,
        organizationId: user.organizationId,
      },
      [PopulatePatterns.metadataFull],
    );

    if (!sourceImage) {
      throw new HttpException(
        {
          detail:
            'The specified image was not found or you do not have access to it',
          title: 'Image not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Extract metadata fields from source image to preserve in split frames
    const sourceMetadata =
      sourceImage.metadata as IngredientMetadataDocument | null;

    // Get the image URL from CDN
    const imageUrl = `${this.configService.ingredientsEndpoint}/images/${id}`;

    this.loggerService.log('Splitting contact sheet', {
      borderInset: splitImageDto.borderInset,
      gridCols: splitImageDto.gridCols,
      gridRows: splitImageDto.gridRows,
      sourceImageId: id,
    });

    // Call files microservice to split the image
    const { frames } = await this.filesClientService.splitImage(
      imageUrl,
      splitImageDto.gridRows,
      splitImageDto.gridCols,
      splitImageDto.borderInset,
    );

    this.loggerService.log(`Split into ${frames.length} frames`);

    // Find or create "splitted" tag
    let splittedTag = await this.tagsService.findOne({
      category: TagCategory.INGREDIENT,
      key: TagKey.SPLITTED,
      organizationId: user.organizationId,
    });

    if (!splittedTag) {
      splittedTag = await this.tagsService.create({
        category: TagCategory.INGREDIENT,
        key: TagKey.SPLITTED,
        label: 'Splitted',
        organizationId: user.organizationId,
      } as unknown as CreateTagDto);
    }

    // Create ingredients for each frame
    const frameResults: Array<{ id: string; url: string; index: number }> = [];

    for (let i = 0; i < frames.length; i++) {
      const frameBuffer = frames[i];

      // Get frame dimensions from buffer metadata
      const frameMetadata = await sharp(frameBuffer).metadata();
      const frameWidth = frameMetadata.width || 0;
      const frameHeight = frameMetadata.height || 0;

      // Create ingredient and metadata for this frame, preserving source metadata
      const { ingredientData } = await this.sharedService.createMediaDocuments(
        user,
        {
          assistant:
            typeof sourceMetadata?.assistant === 'string'
              ? sourceMetadata.assistant
              : undefined,
          brandId: sourceImage.brandId,
          category: IngredientCategory.IMAGE,
          extension: sourceMetadata?.extension || MetadataExtension.JPEG,
          externalId:
            typeof sourceMetadata?.externalId === 'string'
              ? sourceMetadata.externalId
              : undefined,
          externalProvider:
            typeof sourceMetadata?.externalProvider === 'string'
              ? sourceMetadata.externalProvider
              : undefined,
          generationSeed:
            typeof sourceMetadata?.seed === 'number'
              ? sourceMetadata.seed
              : undefined,
          label: `Frame ${i + 1}`,
          model: sourceMetadata?.model,
          organizationId: user.organizationId,
          parentId: id,
          promptId: sourceMetadata?.promptId ?? undefined,
          status: IngredientStatus.GENERATED,
          height: frameHeight,
          style: sourceMetadata?.style ?? undefined,
          tagIds: [splittedTag.id],
          // Set frame-specific dimensions from actual buffer metadata
          width: frameWidth,
        },
      );

      // Upload frame to S3
      await this.filesClientService.uploadToS3(
        ingredientData.id.toString(),
        'images',
        {
          contentType: 'image/jpeg',
          data: frameBuffer,
          type: FileInputType.BUFFER,
        },
      );

      // Update status
      await this.imagesService.patch(ingredientData.id, {
        status: IngredientStatus.GENERATED,
      });

      frameResults.push({
        id: ingredientData.id.toString(),
        index: i,
        url: `${this.configService.ingredientsEndpoint}/images/${ingredientData.id}`,
      });
    }

    // Create activity for the split operation
    await this.activitiesService.create(
      new ActivityEntity({
        brandId: sourceImage.brandId ?? undefined,
        key: ActivityKey.IMAGE_GENERATED,
        organizationId: user.organizationId,
        source: ActivitySource.IMAGE_GENERATION,
        userId: user.userId ?? user.id,
        value: JSON.stringify({
          frameCount: frameResults.length,
          frameIds: frameResults.map((f) => f.id),
          sourceImageId: id,
          type: 'contact-sheet-split',
        }),
      }),
    );

    this.loggerService.log('Contact sheet split complete', {
      frameCount: frameResults.length,
      sourceImageId: id,
    });

    return {
      data: {
        frames: frameResults,
      },
    };
  }
}
