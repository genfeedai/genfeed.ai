import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { buildUpdateOperations } from '@api/helpers/utils/entity-id/update-operations.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@Controller('ingredients')
@UseGuards(RolesGuard)
export class IngredientsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly foldersService: FoldersService,
  ) {}

  @Get('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get multiple ingredients by ID' })
  @ApiResponse({ description: 'Batch ingredients returned', status: 200 })
  async getBatch(
    @Req() request: Request,
    @Query('ids') idsParam: string,
    @CurrentUser() user: User,
  ) {
    if (!idsParam || idsParam.trim().length === 0) {
      throw new BadRequestException('ids query parameter is required');
    }

    const ids = idsParam
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .slice(0, 50);

    if (ids.length === 0) {
      throw new BadRequestException('At least one valid ID is required');
    }

    const publicMetadata = getPublicMetadata(user);
    const ingredients = await this.ingredientsService.findByIds(
      ids,
      publicMetadata.organization,
    );

    return serializeCollection(request, IngredientSerializer, {
      docs: ingredients,
    });
  }

  @Patch(':ingredientId')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @CurrentUser() user: User,
    @Body() updateIngredientDto: UpdateIngredientDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const processedDto = await buildUpdateOperations(
      updateIngredientDto as unknown as Record<string, unknown>,
      ['folder', 'parent'],
    );

    if (
      Object.hasOwn(processedDto, 'tags') &&
      Array.isArray(processedDto.tags)
    ) {
      processedDto.tags = processedDto.tags.map(
        (tag: string | { id?: string; _id?: string }) => {
          if (typeof tag === 'string') {
            return tag;
          }

          // Tag objects carry the canonical `id`; legacy clients may still
          // send `_id` — accept both.
          if (tag && typeof tag === 'object') {
            return tag.id ?? tag._id ?? String(tag);
          }

          return tag as string;
        },
      );
    }

    // Load only an active ingredient in the caller organization, then enforce
    // current-brand or organization-shared access below.
    const ingredient = await this.ingredientsService.findOne(
      {
        _id: ingredientId,
        isDeleted: false,
        organizationId: publicMetadata.organization,
      },
      [PopulatePatterns.metadataFull],
    );

    if (
      !ingredient ||
      (ingredient.brandId &&
        ingredient.brandId.toString() !== publicMetadata.brand)
    ) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    if (Object.hasOwn(processedDto, 'folder') && processedDto.folder !== null) {
      const folder = await this.foldersService.findOne({
        _id: processedDto.folder,
        isDeleted: false,
        organizationId: publicMetadata.organization,
      });

      if (
        !folder ||
        (folder.brandId && folder.brandId.toString() !== publicMetadata.brand)
      ) {
        return returnNotFound(
          this.constructorName,
          String(processedDto.folder),
        );
      }
    }

    if (Object.hasOwn(processedDto, 'folder')) {
      processedDto.folderId = processedDto.folder;
      Reflect.deleteProperty(processedDto, 'folder');
    }

    await this.ingredientsService.patch(
      ingredientId,
      processedDto as unknown as UpdateIngredientDto,
    );

    // Fetch the updated document with populated fields
    // Only populate metadata fully and brand minimally (id, label, handle)
    const data = await this.ingredientsService.findOne(
      {
        _id: ingredientId,
        isDeleted: false,
        organizationId: publicMetadata.organization,
      },
      [PopulatePatterns.metadataFull, PopulatePatterns.brandMinimal],
    );

    return serializeSingle(request, IngredientSerializer, data);
  }
}
