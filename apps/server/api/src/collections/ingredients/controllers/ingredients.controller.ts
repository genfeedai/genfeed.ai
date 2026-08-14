import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { scopedWhere } from '@genfeedai/server';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
    private readonly cancellationService: IngredientGenerationCancellationService,
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

    const ingredients = await this.ingredientsService.findByIds(
      ids,
      user.organizationId,
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
    const processedDto = {
      ...(updateIngredientDto as unknown as Record<string, unknown>),
    };

    // Load only an active ingredient in the caller organization, then enforce
    // current-brand or organization-shared access below.
    const ingredient = await this.ingredientsService.findOne(
      scopedWhere(user.organizationId, { id: ingredientId }),
      [PopulatePatterns.metadataFull],
    );

    if (
      !ingredient ||
      (ingredient.brandId && ingredient.brandId.toString() !== user.brandId)
    ) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    if (
      Object.hasOwn(processedDto, 'folderId') &&
      processedDto.folderId !== null
    ) {
      const folder = await this.foldersService.findOne(
        scopedWhere(user.organizationId, {
          id: processedDto.folderId,
        }),
      );

      if (
        !folder ||
        (folder.brandId && folder.brandId.toString() !== user.brandId)
      ) {
        return returnNotFound(
          this.constructorName,
          String(processedDto.folderId),
        );
      }
    }

    await this.ingredientsService.patch(
      ingredientId,
      processedDto as unknown as UpdateIngredientDto,
    );

    // Fetch the updated document with populated fields
    // Only populate metadata fully and brand minimally (id, label, handle)
    const data = await this.ingredientsService.findOne(
      scopedWhere(user.organizationId, { id: ingredientId }),
      [PopulatePatterns.metadataFull, PopulatePatterns.brandMinimal],
    );

    return serializeSingle(request, IngredientSerializer, data);
  }

  @Post(':ingredientId/cancellations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'IngredientsController.cancelGeneration',
    summary: 'Cancel an in-flight studio generation',
  })
  @ApiResponse({ description: 'Generation cancelled', status: 200 })
  async cancelGeneration(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const ingredient =
      await this.cancellationService.cancelProcessingIngredient({
        id: ingredientId,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      });

    return serializeSingle(request, IngredientSerializer, ingredient);
  }
}
