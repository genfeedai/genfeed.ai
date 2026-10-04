import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BulkTagIngredientsDto } from '@api/collections/ingredients/dto/bulk-tag-ingredients.dto';
import { UpdateTagsDto } from '@api/collections/ingredients/dto/update-tags.dto';
import { IngredientTagsService } from '@api/collections/ingredients/services/ingredient-tags.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { CacheService } from '@api/services/cache/cache.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type {
  IBulkTagResult,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';

/**
 * Library tagging (#6011): set the tags of one asset, and add or remove one tag
 * on up to 200 assets at once. Both only ever attach tags the asset's brand can
 * use (its own, organization-wide, or a legacy default tag).
 */
@AutoSwagger()
@Controller('ingredients')
@UseGuards(RolesGuard)
export class IngredientsTagsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly ingredientTagsService: IngredientTagsService,
    private readonly loggerService: LoggerService,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Patch(':ingredientId/tags')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateTags(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @CurrentUser() user: User,
    @Body() updateTagsDto: UpdateTagsDto,
  ): Promise<JsonApiSingleResponse> {
    const ingredient = await this.ingredientsService.findOne(
      scopedWhere(user.organizationId, { id: ingredientId }),
    );

    if (!ingredient) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    // Tags must be visible to the asset's brand: its own, organization-wide or
    // a legacy default tag. Another brand's or organization's tag is refused.
    await this.ingredientsService.assertClientTags(
      updateTagsDto.tags,
      user.organizationId,
      ingredient.brandId,
    );

    const data = await this.ingredientsService.patch(
      ingredientId,
      { tags: updateTagsDto.tags },
      [{ path: 'tags' }],
    );

    return serializeSingle(request, IngredientSerializer, data);
  }

  /**
   * Add or remove one tag on up to 200 assets in one action.
   *
   * Assets the member cannot edit, or that the tag cannot be attached to, are
   * skipped and counted, never an error for the whole request. The response
   * reports `changed`, `skipped` and `failed` counts.
   */
  @Post('tags/bulk')
  @HttpCode(HttpStatus.OK)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async bulkTag(
    @CurrentUser() user: User,
    @Body() bulkTagDto: BulkTagIngredientsDto,
  ): Promise<IBulkTagResult> {
    const result = await this.ingredientTagsService.bulkSetTag({
      action: bulkTagDto.action,
      editor: {
        brandId: user.brandId,
        userIds: [user.userId, user.id],
      },
      ids: bulkTagDto.ids,
      organizationId: user.organizationId,
      tagId: bulkTagDto.tagId,
    });

    if (result.changed > 0) {
      await this.invalidateIngredientListCache();
    }

    return result;
  }

  /**
   * Library lists are cached for a short time; a tag change has to show on the
   * next read. Resolved lazily so the controller never blocks module init, and
   * never fails the write when the cache is unavailable.
   */
  private async invalidateIngredientListCache(): Promise<void> {
    try {
      await this.moduleRef
        .get(CacheService, { strict: false })
        .invalidateByTags(['ingredients']);
    } catch (error: unknown) {
      this.loggerService.warn(
        `${this.constructorName} could not invalidate the Library list cache`,
        { error },
      );
    }
  }
}
