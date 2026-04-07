/**
 * Assets Operations Controller
 * Handles asset operation routes:
 * - Generate assets with AI
 * - Upload assets
 * - Create assets from ingredients
 */

import { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import { CreateFromIngredientDto } from '@api/collections/assets/dto/create-from-ingredient.dto';
import { GenerateAssetDto } from '@api/collections/assets/dto/generate-asset.dto';
import { AssetEntity } from '@api/collections/assets/entities/asset.entity';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ConfigService } from '@api/config/config.service';
import { ValidationConfigService } from '@api/config/services/validation.config';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import type { User } from '@clerk/backend';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  ActivitySource,
  AssetCategory,
  AssetParent,
  FileInputType,
  IngredientCategory,
  ModelCategory,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { AssetSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { isValidObjectId, Types } from 'mongoose';

@AutoSwagger()
@Controller('assets')
@UseGuards(RolesGuard)
export class AssetsOperationsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly assetsService: AssetsService,
    private readonly brandsService: BrandsService,
    private readonly cacheService: CacheService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly validationConfigService: ValidationConfigService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post('generate')
  @Credits({
    amount: 200, // price for nano banana
    description: 'Asset generation',
    source: ActivitySource.ASSET_GENERATION,
  })
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generate(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() generateAssetDto: GenerateAssetDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    let parentId: Types.ObjectId;
    if (generateAssetDto.parentModel === AssetParent.BRAND) {
      const parentIdString =
        generateAssetDto.parent instanceof Types.ObjectId
          ? generateAssetDto.parent.toString()
          : String(generateAssetDto.parent || '');

      parentId = await ObjectIdUtil.validate(parentIdString, 'parent');
    } else {
      if (!publicMetadata.brand) {
        throw new ValidationException('Brand ID is required');
      }

      parentId = new Types.ObjectId(publicMetadata.brand);
    }

    const category = InputValidationUtil.validateString(
      generateAssetDto.category,
      'category',
      {
        maxLength: 50,
      },
    ).toLowerCase() as AssetCategory;

    const text = InputValidationUtil.validateString(
      generateAssetDto.text,
      'text',
    );

    if (![AssetCategory.LOGO, AssetCategory.BANNER].includes(category)) {
      throw new ValidationException('Invalid asset type');
    }

    const { width, height } =
      category === AssetCategory.BANNER
        ? { height: 1080, width: 1920 }
        : { height: 1024, width: 1024 };

    // Fetch brand - use parentId if parentModel is Brand, otherwise use publicMetadata.brand
    let brand: BrandDocument | null = null;
    const brandIdToUse =
      generateAssetDto.parentModel === AssetParent.BRAND
        ? parentId
        : publicMetadata.brand
          ? new Types.ObjectId(publicMetadata.brand)
          : null;

    if (brandIdToUse) {
      try {
        brand = await this.brandsService.findOne({
          _id: brandIdToUse,
          isDeleted: false,
          organization: new Types.ObjectId(publicMetadata.organization),
        });
      } catch (error) {
        this.loggerService.error(`${url} - Failed to fetch brand`, error);
        // Continue without brand if fetch fails
      }
    }

    const selectedModel = this.configService.isProduction
      ? MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA
      : MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST;

    // Build enhanced prompt using brand information
    let enhancedPrompt = text;
    if (brand && category === AssetCategory.BANNER) {
      const brandInfo: string[] = [];
      brandInfo.push(
        `Generate a professional landscape banner (1920x1080) for ${brand.label}.`,
      );

      if (brand.description) {
        brandInfo.push(brand.description);
      }

      if (brand.primaryColor && brand.primaryColor !== '#000000') {
        brandInfo.push(`Primary color: ${brand.primaryColor}`);
      }

      if (brand.secondaryColor && brand.secondaryColor !== '#FFFFFF') {
        brandInfo.push(`Secondary color: ${brand.secondaryColor}`);
      }

      brandInfo.push('Style: modern, clean, professional');
      enhancedPrompt = `${brandInfo.join('. ')}`;
    } else if (brand && category === AssetCategory.LOGO) {
      const brandInfo: string[] = [];
      brandInfo.push(
        `Generate a professional logo (1024x1024) for ${brand.label}.`,
      );

      if (brand.description) {
        brandInfo.push(brand.description);
      }

      if (brand.primaryColor && brand.primaryColor !== '#000000') {
        brandInfo.push(`Primary color: ${brand.primaryColor}`);
      }

      if (brand.secondaryColor && brand.secondaryColor !== '#FFFFFF') {
        brandInfo.push(`Secondary color: ${brand.secondaryColor}`);
      }

      brandInfo.push('Style: modern, clean, professional');
      enhancedPrompt = `${brandInfo.join('. ')}`;
    } else if (category === AssetCategory.BANNER) {
      enhancedPrompt = `Generate a professional landscape banner (1920x1080). ${text}`;
    } else if (category === AssetCategory.LOGO) {
      enhancedPrompt = `Generate a professional logo (1024x1024). ${text}`;
    }

    // Replace the logo / banner
    await this.assetsService.patchAll(
      {
        category,
        parent: parentId,
        user: new Types.ObjectId(publicMetadata.user),
      },
      { isDeleted: true },
    );

    const assetData = await this.assetsService.create(
      new AssetEntity({
        category,
        parent: parentId,
        parentModel: generateAssetDto.parentModel,
        user: new Types.ObjectId(publicMetadata.user),
      }),
    );

    const { input: promptParams } = await this.promptBuilderService.buildPrompt(
      selectedModel as string,
      {
        brand: brand
          ? {
              label: brand.label,
              primaryColor: brand.primaryColor,
              secondaryColor: brand.secondaryColor,
              text: brand.text,
            }
          : undefined,
        height,
        modelCategory: ModelCategory.IMAGE,
        prompt: enhancedPrompt,
        style: 'natural',
        width,
      },
      publicMetadata.organization,
    );

    const generationId = await this.replicateService.generateTextToImage(
      selectedModel as string,
      promptParams,
    );

    if (!generationId) {
      throw new ValidationException('Failed to start image generation');
    }

    await this.assetsService.patch(assetData._id, {
      externalId: generationId,
    });

    this.loggerService.log(`${url} - Replicate generation started`, {
      assetId: assetData._id,
      category,
      generationId,
    });

    return serializeSingle(request, AssetSerializer, assetData);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max for assets
      },
    }),
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createUpload(
    @Req() request: Request,
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: CreateAssetDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`, { category: uploadDto.category });

    // Validate file upload
    const validatedFile = InputValidationUtil.validateFileUpload(file, 'file', {
      allowedExtensions:
        this.validationConfigService.getAllowedImageExtensions(),
      allowedMimeTypes: this.validationConfigService.getAllowedImageMimeTypes(),
      required: true,
      validationConfig: this.validationConfigService,
    });

    if (!validatedFile) {
      throw new ValidationException('File is required');
    }

    const contentType = validatedFile.mimetype;
    const publicMetadata = getPublicMetadata(user);

    try {
      const entityData = {
        category: uploadDto.category,
        parent:
          uploadDto.parent && isValidObjectId(uploadDto.parent)
            ? new Types.ObjectId(uploadDto.parent)
            : undefined,
        parentModel: uploadDto.parentModel,
        user: new Types.ObjectId(publicMetadata.user),
      };

      this.loggerService.log(`${url} - Creating asset with data`, {
        entityData: {
          ...entityData,
          parent: entityData.parent?.toString(),
          user: entityData.user.toString(),
        },
      });

      if (
        (uploadDto.category === AssetCategory.LOGO ||
          uploadDto.category === AssetCategory.BANNER) &&
        entityData.parent &&
        uploadDto.parentModel === AssetParent.BRAND
      ) {
        await this.assetsService.patchAll(
          {
            category: uploadDto.category,
            isDeleted: false,
            parent: entityData.parent,
            parentModel: AssetParent.BRAND,
          },
          { isDeleted: true },
        );

        await this.cacheService.invalidateByTags([
          'brands',
          'links',
          'assets',
          'public',
        ]);

        if (uploadDto.parent) {
          try {
            await this.cacheService.del(`brand:${uploadDto.parent}`);
          } catch (_error) {
            // Ignore if key doesn't exist
          }
        }
      }

      const assetData = await this.assetsService.create(
        new AssetEntity(entityData),
      );

      this.loggerService.log(`${url} - Asset created successfully`, {
        assetId: assetData._id,
        category: assetData.category,
        parent: assetData.parent?.toString(),
        parentModel: assetData.parentModel,
      });

      await this.filesClientService.uploadToS3(
        assetData._id,
        `${uploadDto.category}s`,
        {
          contentType,
          data: file.buffer,
          type: FileInputType.BUFFER,
        },
      );

      const userId = publicMetadata.user;
      if (userId) {
        await this.websocketService.publishAssetStatus(
          assetData._id.toString(),
          'completed',
          userId,
          {
            assetId: assetData._id.toString(),
            category: assetData.category,
            parent: assetData.parent?.toString(),
            parentModel: assetData.parentModel,
          },
        );

        if (
          uploadDto.parent &&
          [AssetCategory.LOGO, AssetCategory.BANNER].includes(
            uploadDto.category,
          )
        ) {
          await this.websocketService.publishBrandRefresh(
            uploadDto.parent.toString(),
            userId,
            {
              assetId: assetData._id.toString(),
              category: uploadDto.category,
            },
          );
        }

        this.loggerService.log(`${url} - Published websocket event`, {
          assetId: assetData._id,
          category: assetData.category,
          userId,
        });
      }

      this.loggerService.log(`${url} completed`);
      return serializeSingle(request, AssetSerializer, assetData);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Post('from-ingredient')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createFromIngredient(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createFromIngredientDto: CreateFromIngredientDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const publicMetadata = getPublicMetadata(user);

    // Validate inputs
    const validatedIngredientId = InputValidationUtil.validateObjectId(
      createFromIngredientDto.ingredientId,
      'ingredientId',
    );

    const validatedCategory = createFromIngredientDto.category;

    if (
      ![AssetCategory.LOGO, AssetCategory.BANNER].includes(validatedCategory)
    ) {
      throw new ValidationException('Category must be logo or banner');
    }

    const validatedParent = InputValidationUtil.validateObjectId(
      createFromIngredientDto.parent,
      'parent',
    );

    // Get ingredient with metadata
    const ingredient = await this.ingredientsService.findOne({
      _id: validatedIngredientId,
      isDeleted: false,
      user: new Types.ObjectId(publicMetadata.user),
    });

    if (!ingredient) {
      return returnNotFound('Ingredient', validatedIngredientId);
    }

    if (ingredient.category !== IngredientCategory.IMAGE) {
      throw new ValidationException('Only images can be set as logo or banner');
    }

    if (!ingredient.metadata) {
      throw new ValidationException('Ingredient metadata not found');
    }

    const metadata = await this.metadataService.findOne({
      _id: ingredient.metadata,
      isDeleted: false,
    });

    if (!metadata) {
      throw new ValidationException('Ingredient metadata not found');
    }

    const ingredientType = 'images';
    const sourceKey = `ingredients/${ingredientType}/${validatedIngredientId}`;

    const parentObjectId = new Types.ObjectId(validatedParent);
    await this.assetsService.patchAll(
      {
        category: validatedCategory,
        isDeleted: false,
        parent: parentObjectId,
        parentModel: AssetParent.BRAND,
      },
      { isDeleted: true },
    );

    const assetData = await this.assetsService.create(
      new AssetEntity({
        category: validatedCategory,
        parent: parentObjectId,
        parentModel: AssetParent.BRAND,
        user: new Types.ObjectId(publicMetadata.user),
      }),
    );

    const destinationKey = `ingredients/${validatedCategory}s/${assetData._id}`;

    try {
      // Extract source type and key from sourceKey (format: ingredients/{type}/{id})
      const sourceMatch = sourceKey.match(/ingredients\/([^/]+)\/(.+)$/);
      const sourceType = sourceMatch ? sourceMatch[1] : undefined;
      const sourceKeyOnly = sourceMatch
        ? sourceMatch[2]
        : sourceKey.replace(/^ingredients\/[^/]+\//, '');

      // Extract destination key (format: ingredients/{type}/{id})
      const destKeyOnly = assetData._id.toString();

      await this.filesClientService.copyInS3(
        sourceKeyOnly,
        destKeyOnly,
        sourceType,
        `${validatedCategory}s`,
      );
    } catch (error) {
      this.loggerService.error(`${url} - Failed to copy file from S3`, {
        destinationKey,
        error,
        sourceKey,
      });

      await this.assetsService.remove(assetData._id);

      throw new ValidationException(
        'Failed to copy ingredient file. The source file may not exist or there was an S3 error.',
      );
    }

    await this.cacheService.invalidateByTags([
      'brands',
      'links',
      'assets',
      'public',
    ]);

    if (validatedParent) {
      try {
        await this.cacheService.del(`brand:${validatedParent}`);
      } catch (_error) {
        // Ignore if key doesn't exist
      }
    }

    const userId = publicMetadata.user;
    if (userId) {
      await this.websocketService.publishAssetStatus(
        assetData._id.toString(),
        'completed',
        userId,
        {
          assetId: assetData._id.toString(),
          category: assetData.category,
          parent: assetData.parent?.toString(),
          parentModel: assetData.parentModel,
        },
      );

      if (validatedParent) {
        await this.websocketService.publishBrandRefresh(
          validatedParent.toString(),
          userId,
          {
            assetId: assetData._id.toString(),
            category: validatedCategory,
          },
        );
      }
    }

    this.loggerService.log(`${url} completed`, {
      assetId: assetData._id,
      category: validatedCategory,
      ingredientId: validatedIngredientId,
    });

    return serializeSingle(request, AssetSerializer, assetData);
  }
}
