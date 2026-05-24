import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { buildUpdateOperations } from '@api/helpers/utils/objectid/update-operations.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
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

  constructor(private readonly ingredientsService: IngredientsService) {}

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
        (tag: string | { _id: string }) => {
          if (typeof tag === 'string') {
            return tag;
          }

          // If tag is an object with _id, convert the _id
          if (tag && typeof tag === 'object' && '_id' in tag) {
            return tag._id;
          }

          // If already ObjectId, return as is
          return tag as string;
        },
      );
    }

    // Find the ingredient first to ensure it exists and belongs to the user or organization
    const ingredient = await this.ingredientsService.findOne(
      {
        _id: ingredientId,
        OR: [
          { user: publicMetadata.user },
          { organization: publicMetadata.organization },
        ],
      },
      [PopulatePatterns.metadataFull],
    );

    if (!ingredient) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    await this.ingredientsService.patch(
      ingredientId,
      processedDto as unknown as UpdateIngredientDto,
    );

    // Fetch the updated document with populated fields
    // Only populate metadata fully and brand minimally (id, label, handle)
    const data = await this.ingredientsService.findOne({ _id: ingredientId }, [
      PopulatePatterns.metadataFull,
      PopulatePatterns.brandMinimal,
    ]);

    return serializeSingle(request, IngredientSerializer, data);
  }
}
