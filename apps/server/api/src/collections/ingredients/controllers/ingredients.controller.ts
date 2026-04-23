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
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { Body, Controller, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('ingredients')
@UseGuards(RolesGuard)
export class IngredientsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(private readonly ingredientsService: IngredientsService) {}

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

    // Build update operations for relationship fields (folder, parent)
    // This separates fields into $set (non-null) and $unset (null) operations
    const updateOps = await buildUpdateOperations(
      updateIngredientDto as unknown as Record<string, unknown>,
      ['folder', 'parent'],
    );

    // Start with the update operations
    const processedDto: Record<string, unknown> = { ...updateOps };

    // Convert tags array to ObjectIds (if present in $set)
    if (
      updateOps.$set &&
      Object.hasOwn(updateOps.$set, 'tags') &&
      Array.isArray(updateOps.$set.tags)
    ) {
      updateOps.$set.tags = updateOps.$set.tags.map(
        (tag: string | { _id: string }) => {
          // If tag is a string ID, convert to ObjectId
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

    // Update the ingredient - processedDto may contain $set/$unset operators
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
