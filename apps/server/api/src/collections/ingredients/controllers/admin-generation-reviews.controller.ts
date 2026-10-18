import { AdminGenerationReviewsQueryDto } from '@api/collections/ingredients/dto/admin-generation-reviews-query.dto';
import { AdminGenerationReviewsService } from '@api/collections/ingredients/services/admin-generation-reviews.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { IngredientSerializer } from '@genfeedai/serializers';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@Controller('ingredients/admin/generation-reviews')
@UseGuards(RolesGuard)
export class AdminGenerationReviewsController {
  constructor(private readonly reviews: AdminGenerationReviewsService) {}

  @Get()
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    summary:
      'List generations with original, enhanced and compiled prompts across organizations',
  })
  @ApiResponse({ description: 'Generation reviews returned', status: 200 })
  async list(
    @Req() request: Request,
    @Query() query: AdminGenerationReviewsQueryDto,
  ) {
    return serializeCollection(
      request,
      IngredientSerializer,
      await this.reviews.list(query),
    );
  }
}
