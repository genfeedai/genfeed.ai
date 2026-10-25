import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientGenerationCostService } from '@api/collections/ingredients/services/ingredient-generation-cost.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { IngredientGenerationCostSerializer } from '@genfeedai/serializers';
import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

/**
 * What a generated asset cost in credits, for the asset details panel. Credit
 * holds are billing data, so the read is scoped to the caller's organization
 * even for public assets.
 */
@AutoSwagger()
@Controller('ingredients')
@UseGuards(RolesGuard)
export class IngredientGenerationCostController {
  constructor(private readonly costService: IngredientGenerationCostService) {}

  @Get(':ingredientId/generation-cost')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findGenerationCost(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('ingredientId') ingredientId: string,
  ): Promise<JsonApiSingleResponse> {
    const { organizationId } = extractRequestContext(user);
    const cost = organizationId
      ? await this.costService.find(organizationId, ingredientId)
      : { credits: null, status: null };
    return serializeSingle(request, IngredientGenerationCostSerializer, {
      id: ingredientId,
      ...cost,
    });
  }
}
