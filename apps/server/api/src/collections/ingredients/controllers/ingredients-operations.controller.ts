import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BulkDeleteIngredientsDto } from '@api/collections/ingredients/dto/bulk-delete-ingredients.dto';
import { UpdateTagsDto } from '@api/collections/ingredients/dto/update-tags.dto';
import type { IngredientMetadataDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { UpdateMetadataDto } from '@api/collections/metadata/dto/update-metadata.dto';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  categoryToPlural,
  FileInputType,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import {
  IngredientSerializer,
  MetadataSerializer,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
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
    const organizationId = user.organizationId.toString();

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
    const callerOrganizationId = user.organizationId.toString();

    const ingredient = await this.ingredientsService.findOne(
      {
        id: ingredientId,
        organizationId: callerOrganizationId,
      },
      [PopulatePatterns.metadataFull],
    );

    if (!ingredient) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    const metadata = (ingredient.metadata ?? {}) as IngredientMetadataDocument;

    // Create ingredient with PROCESSING status under the caller's organization
    const { metadataData, ingredientData } =
      await this.getSharedService().createMediaDocuments(user, {
        brandId: user.brandId,
        category: ingredient.category,
        duration: metadata.duration,
        extension: metadata.extension,
        height: metadata.height,
        model: metadata.model,
        organizationId: callerOrganizationId,
        parentId: ingredientId,
        promptId: metadata.promptId ?? undefined,
        result: metadata.result,
        size: metadata.size,
        status: IngredientStatus.PROCESSING,
        style: metadata.style,
        width: metadata.width,
      });

    // Start async processing (fire and forget)
    this.processCloneAsync(
      ingredientData.id.toString(),
      metadataData.id.toString(),
      ingredient.category,
      ingredientId,
      user.userId ?? user.id,
    ).catch((error) => {
      this.loggerService.error(`${url} async processing failed`, {
        error,
        ingredientId: ingredientData.id,
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
      const uploadUrl = `${this.configService.ingredientsEndpoint}/${categoryToPlural(category)}/${originalIngredientId}`;

      const uploadMeta = await this.getFilesClientService().uploadToS3(
        newIngredientId,
        categoryToPlural(category),
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

    // Find the ingredient first to ensure it exists and belongs to the user or organization
    const ingredient = await this.ingredientsService.findOne(
      {
        id: ingredientId,
        OR: [
          { userId: user.userId ?? user.id },
          { organizationId: user.organizationId },
        ],
      },
      [PopulatePatterns.metadataFull],
    );

    if (!ingredient) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    if (!ingredient.metadataId) {
      throw new HttpException(
        {
          detail: 'This ingredient does not have metadata',
          title: 'Metadata not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const ingredientUrl = `${this.configService.ingredientsEndpoint}/${categoryToPlural(ingredient.category)}/${ingredientId}`;

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
      await this.metadataService.patch(ingredient.metadataId, updateData);

      // Fetch the updated ingredient with metadata
      const updatedIngredient = await this.ingredientsService.findOne(
        {
          id: ingredientId,
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
    // Find the ingredient first to ensure it exists and belongs to the user or organization
    const ingredient = await this.ingredientsService.findOne(
      {
        id: ingredientId,
        OR: [
          { userId: user.userId ?? user.id },
          { organizationId: user.organizationId },
        ],
      },
      [PopulatePatterns.metadataFull],
    );

    if (!ingredient) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    if (!ingredient.metadataId) {
      throw new HttpException(
        {
          detail: 'This ingredient does not have metadata',
          title: 'Metadata not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Update the metadata
    const metadataId = ingredient.metadataId;

    await this.metadataService.patch(metadataId, metadataDto);

    // Fetch the updated metadata
    const updatedMetadata = await this.metadataService.findOne({
      id: metadataId,
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
    // Find the ingredient first to ensure it exists and belongs to the user or organization
    const ingredient = await this.ingredientsService.findOne({
      id: ingredientId,
      OR: [
        { userId: user.userId ?? user.id },
        { organizationId: user.organizationId },
      ],
    });

    if (!ingredient) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    // Now set the new valid tags using service method
    const data = await this.ingredientsService.patch(
      ingredientId,
      { tags: updateTagsDto.tags },
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

    // One scoped partition query + one soft-delete write, regardless of how
    // many ids the caller supplies. Permission semantics are unchanged: an id
    // is deletable when it exists, is not already deleted, and the caller
    // either owns it or shares its organization.
    const { deleted, failed } =
      await this.ingredientsService.bulkSoftDeleteScoped({
        ids: bulkDeleteDto.ids,
        organizationId: user.organizationId.toString(),
        userId: (user.userId ?? user.id).toString(),
      });

    if (failed.length > 0) {
      this.loggerService.warn(`${url} skipped inaccessible ingredients`, {
        count: failed.length,
        orgId: user.organizationId,
        userId: user.userId ?? user.id,
      });
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
