import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { SplitImageDto } from '@api/collections/images/dto/split-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import type { IngredientRefDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { TagsService } from '@api/collections/tags/services/tags.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { ConfigService } from '@api/config/config.service';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
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
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
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
    const publicMetadata = getPublicMetadata(user);

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
        _id: id,
        isDeleted: false,
        organization: publicMetadata.organization,
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
    const sourceMetadata = sourceImage.metadata as unknown as Record<
      string,
      unknown
    >;
    const metadataFields: Record<string, unknown> = {
      // Copy model, style, extension, prompt from source
      ...(sourceMetadata?.model ? { model: sourceMetadata.model } : {}),
      ...(sourceMetadata?.style ? { style: sourceMetadata.style } : {}),
      ...(sourceMetadata?.extension
        ? { extension: sourceMetadata.extension }
        : {}),
      ...(typeof sourceMetadata?.prompt === 'string'
        ? { prompt: sourceMetadata.prompt }
        : {}),
      ...(sourceMetadata?.assistant
        ? { assistant: sourceMetadata.assistant }
        : {}),
      ...(sourceMetadata?.seed !== undefined
        ? { seed: sourceMetadata.seed }
        : {}),
      ...(sourceMetadata?.externalId
        ? { externalId: sourceMetadata.externalId }
        : {}),
      ...(sourceMetadata?.externalProvider
        ? { externalProvider: sourceMetadata.externalProvider }
        : {}),
    };

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
      isDeleted: false,
      key: TagKey.SPLITTED,
      organization: publicMetadata.organization,
    });

    if (!splittedTag) {
      splittedTag = await this.tagsService.create({
        category: TagCategory.INGREDIENT,
        key: TagKey.SPLITTED,
        label: 'Splitted',
        organization: publicMetadata.organization,
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
      const { ingredientData } = await this.sharedService.saveDocuments(user, {
        brand: sourceImage.brand,
        category: IngredientCategory.IMAGE,
        extension: metadataFields.extension || MetadataExtension.JPEG,
        label: `Frame ${i + 1}`,
        organization: publicMetadata.organization,
        parent: id,
        status: IngredientStatus.GENERATED,
        // Preserve metadata fields from source image
        ...metadataFields,
        height: frameHeight,
        // Add "splitted" tag
        tags: [splittedTag.id],
        // Set frame-specific dimensions from actual buffer metadata
        width: frameWidth,
      });

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
        brand: this.getRefId(sourceImage.brand),
        key: ActivityKey.IMAGE_GENERATED,
        organization: publicMetadata.organization,
        source: ActivitySource.IMAGE_GENERATION,
        user: publicMetadata.user,
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

  private getRefId(
    ref: string | IngredientRefDocument | null | undefined,
  ): string | undefined {
    if (typeof ref === 'string') {
      return ref;
    }

    return ref?.id?.toString() ?? ref?.id?.toString();
  }
}
