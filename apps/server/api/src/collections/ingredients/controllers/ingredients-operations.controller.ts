import { BulkDeleteIngredientsDto } from '@api/collections/ingredients/dto/bulk-delete-ingredients.dto';
import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import { UpdateTagsDto } from '@api/collections/ingredients/dto/update-tags.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { UpdateMetadataDto } from '@api/collections/metadata/dto/update-metadata.dto';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ConfigService } from '@api/config/config.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
import { FileInputType, IngredientStatus } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import {
  IngredientSerializer,
  MetadataSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';

@AutoSwagger()
@Controller('ingredients')
@UseGuards(RolesGuard)
export class IngredientsOperationsController {
  private readonly constructorName: string = String(this.constructor.name);
  private sharedService!: SharedService;
  private notificationsPublisher!: NotificationsPublisherService;
  private filesClientService!: FilesClientService;

  constructor(
    private readonly configService: ConfigService,
    private readonly ingredientsService: IngredientsService,
    private readonly metadataService: MetadataService,
    private readonly moduleRef: ModuleRef,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Lazy-load FilesClientService via ModuleRef to avoid blocking HTTP module init
   */
  private getFilesClientService(): FilesClientService {
    if (!this.filesClientService) {
      this.filesClientService = this.moduleRef.get(FilesClientService, {
        strict: false,
      });
    }
    return this.filesClientService;
  }

  /**
   * Lazy-load SharedService via ModuleRef to avoid circular dependency
   */
  private getSharedService(): SharedService {
    if (!this.sharedService) {
      this.sharedService = this.moduleRef.get(SharedService, { strict: false });
    }
    return this.sharedService;
  }

  /**
   * Lazy-load NotificationsPublisherService via ModuleRef
   */
  private getNotificationsPublisher(): NotificationsPublisherService {
    if (!this.notificationsPublisher) {
      this.notificationsPublisher = this.moduleRef.get(
        NotificationsPublisherService,
        { strict: false },
      );
    }
    return this.notificationsPublisher;
  }

  @Get('analytics')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  getAnalytics(
    @CurrentUser() user: User,
    @Query('category') category?: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization.toString();

    return this.ingredientsService.getKPIMetrics(organizationId, category);
  }

  @Post(':ingredientId/clone')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async cloneIngredient(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('ingredientId') ingredientId: string,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    const ingredient = await this.ingredientsService.findOne(
      { _id: ingredientId },
      [PopulatePatterns.metadataFull],
    );

    if (!ingredient) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    const metadata: unknown = ingredient.metadata;

    // Create ingredient with PROCESSING status
    const { metadataData, ingredientData } =
      await this.getSharedService().saveDocuments(user, {
        brand: ingredient.brand,
        category: ingredient.category,
        duration: metadata.duration,
        extension: metadata.extension,
        height: metadata.height,
        model: metadata.model,
        organization: ingredient.organization,
        parent: ingredientId,
        prompt: metadata.prompt,
        result: metadata.result,
        size: metadata.size,
        status: IngredientStatus.PROCESSING,
        style: metadata.style,
        width: metadata.width,
      } as CreateIngredientDto);

    // Start async processing (fire and forget)
    this.processCloneAsync(
      ingredientData._id.toString(),
      metadataData._id.toString(),
      ingredient.category,
      ingredientId,
      publicMetadata.user,
    ).catch((error) => {
      this.loggerService.error(`${url} async processing failed`, {
        error,
        ingredientId: ingredientData._id,
      });
    });

    // Return immediately with PROCESSING status
    return serializeSingle(request, IngredientSerializer, ingredientData);
  }

  /**
   * Process ingredient cloning asynchronously
   * Uploads file to S3 and updates metadata
   */
  private async processCloneAsync(
    newIngredientId: string,
    metadataId: string,
    category: string,
    originalIngredientId: string,
    userId: string,
  ): Promise<void> {
    const url = `${this.constructorName} processCloneAsync`;

    try {
      this.loggerService.log(`${url} started`, {
        newIngredientId,
        originalIngredientId,
      });

      // Upload file from original ingredient URL
      const uploadUrl = `${this.configService.ingredientsEndpoint}/${category}s/${originalIngredientId}`;

      const uploadMeta = await this.getFilesClientService().uploadToS3(
        newIngredientId,
        `${category}s`,
        {
          type: FileInputType.URL,
          url: uploadUrl,
        },
      );

      // Update metadata with actual file info
      await this.metadataService.patch(metadataId, {
        duration: uploadMeta.duration,
        hasAudio: uploadMeta.hasAudio,
        height: uploadMeta.height,
        size: uploadMeta.size,
        width: uploadMeta.width,
      });

      // Update ingredient status to GENERATED
      await this.ingredientsService.patch(newIngredientId, {
        status: IngredientStatus.GENERATED,
      });

      // Publish websocket update
      await this.getNotificationsPublisher().publishIngredientStatus(
        newIngredientId,
        IngredientStatus.GENERATED,
        userId,
        {
          category,
          message: 'Ingredient cloned successfully',
        },
      );

      this.loggerService.log(`${url} completed`, { newIngredientId });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        error,
        newIngredientId,
      });

      // Update ingredient status to FAILED
      await this.ingredientsService.patch(newIngredientId, {
        status: IngredientStatus.FAILED,
      });

      // Publish websocket failure
      await this.getNotificationsPublisher().publishIngredientStatus(
        newIngredientId,
        IngredientStatus.FAILED,
        userId,
        {
          category,
          error: (error as Error)?.message || 'Failed to clone ingredient',
        },
      );
    }
  }

  @Post(':ingredientId/metadata')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async refreshMetadata(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const publicMetadata = getPublicMetadata(user);

    // Find the ingredient first to ensure it exists and belongs to the user or organization
    const ingredient = await this.ingredientsService.findOne(
      {
        _id: ingredientId,
        $or: [
          { user: publicMetadata.user },
          { organization: publicMetadata.organization },
        ],
        isDeleted: false,
      },
      [PopulatePatterns.metadataFull],
    );

    if (!ingredient) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    if (!ingredient.metadata) {
      throw new HttpException(
        {
          detail: 'This ingredient does not have metadata',
          title: 'Metadata not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const ingredientUrl = `${this.configService.ingredientsEndpoint}/${ingredient.category}s/${ingredientId}`;

    try {
      // Extract metadata from the file URL without re-uploading
      // Use extractMetadataFromUrl instead of uploadToS3 to avoid re-uploading existing files
      const uploadMeta =
        await this.getFilesClientService().extractMetadataFromUrl(
          ingredientUrl,
        );

      // Ensure width/height are valid numbers (not 0 or undefined)
      // This prevents saving invalid dimensions that cause frontend display issues
      const updateData: Partial<Record<string, unknown>> = {
        duration: uploadMeta.duration,
        hasAudio: uploadMeta.hasAudio,
        size: uploadMeta.size,
      };

      // Only update width/height if they are valid (> 0)
      if (uploadMeta.width && uploadMeta.width > 0) {
        updateData.width = uploadMeta.width;
      }

      if (uploadMeta.height && uploadMeta.height > 0) {
        updateData.height = uploadMeta.height;
      }

      // Log if dimensions are missing for debugging
      if (
        !uploadMeta.width ||
        uploadMeta.width <= 0 ||
        !uploadMeta.height ||
        uploadMeta.height <= 0
      ) {
        this.loggerService.warn(`${url} dimensions not extracted`, {
          ingredientId,
          uploadMeta,
        });
      }

      // Update the metadata
      const metadataId = ingredient.metadata._id.toString();
      await this.metadataService.patch(metadataId, updateData);

      // Fetch the updated ingredient with metadata
      const updatedIngredient = await this.ingredientsService.findOne(
        {
          _id: ingredientId,
        },
        [PopulatePatterns.metadataFull],
      );

      this.loggerService.log(`${url} success`, { ingredientId });
      return serializeSingle(request, IngredientSerializer, updatedIngredient);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Unknown error occurred',
          title: 'Failed to refresh metadata',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(':ingredientId/metadata')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateMetadata(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @CurrentUser() user: User,
    @Body() metadataDto: UpdateMetadataDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Find the ingredient first to ensure it exists and belongs to the user or organization
    const ingredient = await this.ingredientsService.findOne(
      {
        _id: ingredientId,
        $or: [
          { user: publicMetadata.user },
          { organization: publicMetadata.organization },
        ],
      },
      [PopulatePatterns.metadataFull],
    );

    if (!ingredient) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    if (!ingredient.metadata) {
      throw new HttpException(
        {
          detail: 'This ingredient does not have metadata',
          title: 'Metadata not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Update the metadata
    const metadataId = ingredient.metadata._id.toString();

    await this.metadataService.patch(metadataId, metadataDto);

    // Fetch the updated metadata
    const updatedMetadata = await this.metadataService.findOne({
      _id: metadataId,
    });

    return serializeSingle(request, MetadataSerializer, updatedMetadata);
  }

  @Patch(':ingredientId/tags')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateTags(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @CurrentUser() user: User,
    @Body() updateTagsDto: UpdateTagsDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Find the ingredient first to ensure it exists and belongs to the user or organization
    const ingredient = await this.ingredientsService.findOne({
      _id: ingredientId,
      $or: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
      ],
    });

    if (!ingredient) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    // Convert to ObjectIds
    const tagObjectIds = updateTagsDto.tags.map((tagId: string) => tagId);

    this.loggerService.log(`Converted to ObjectIds`, { tagObjectIds });

    // Now set the new valid tags using service method
    const data = await this.ingredientsService.patch(
      ingredientId,
      { tags: tagObjectIds } as unknown as UpdateIngredientDto,
      [{ path: 'tags' }],
    );

    return serializeSingle(request, IngredientSerializer, data);
  }

  /**
   * Bulk delete ingredients
   * Validates user permissions for each ingredient before deletion
   */
  @Delete()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async bulkDelete(
    @CurrentUser() user: User,
    @Body() bulkDeleteDto: BulkDeleteIngredientsDto,
  ): Promise<{ deleted: string[]; failed: string[]; message: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    const deleted: string[] = [];
    const failed: string[] = [];

    // Process each ID for deletion
    for (const id of bulkDeleteDto.ids) {
      try {
        // Find the ingredient and check permissions
        const ingredient = await this.ingredientsService.findOne({
          _id: id,
          isDeleted: false,
        });

        if (!ingredient) {
          failed.push(id);
          continue;
        }

        // Check if user has permission to delete
        // User must be the owner or in the same organization
        const isOwner =
          publicMetadata.user.toString() === ingredient.user.id.toString();

        const isSameOrg =
          publicMetadata.organization.toString() ===
          ingredient.organization.id.toString();

        if (!isOwner && !isSameOrg) {
          this.loggerService.warn(`${url} permission denied`, {
            ingredientId: id,
            orgId: publicMetadata.organization,
            userId: publicMetadata.user,
          });

          failed.push(id);
          continue;
        }

        // Soft delete the ingredient
        await this.ingredientsService.patch(id, { isDeleted: true });
        deleted.push(id);

        this.loggerService.log(`${url} deleted ingredient`, { id });
      } catch (error: unknown) {
        this.loggerService.error(`${url} failed to delete ingredient`, {
          error,
          id,
        });
        failed.push(id);
      }
    }

    const message = `Successfully deleted ${deleted.length} ingredient(s)${
      failed.length > 0 ? `, failed to delete ${failed.length}` : ''
    }`;

    this.loggerService.log(`${url} completed`, {
      deleted: deleted.length,
      failed: failed.length,
      totalRequested: bulkDeleteDto.ids.length,
    });

    return {
      deleted,
      failed,
      message,
    };
  }
}
