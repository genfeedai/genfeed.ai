import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ResolveVideoRecipeRoutingDto } from '@api/services/video-recipes/dto/resolve-video-recipe-routing.dto';
import { VideoRecipeRoutingService } from '@api/services/video-recipes/video-recipe-routing.service';
import { videoRecipeRoutingRequestSchema } from '@genfeedai/contracts/api-types/contracts/video-recipe.contract';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';

@Controller('brands/:brandId/video-recipes')
@OrganizationModule('storyboard', 'read')
export class VideoRecipesController {
  constructor(private readonly routing: VideoRecipeRoutingService) {}

  /** Which model runs each step of a recipe for this brand, and why. Spends nothing. */
  @Post(':recipeKey/routing')
  @HttpCode(200)
  async resolveRouting(
    @Param('brandId') brandId: string,
    @Param('recipeKey') recipeKey: string,
    @CurrentUser() user: User,
    @Body() body: ResolveVideoRecipeRoutingDto,
  ) {
    const parsed = videoRecipeRoutingRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message).join('; '),
      );
    }
    return this.routing.resolve(
      user.organizationId,
      brandId,
      recipeKey,
      parsed.data.pins,
    );
  }
}
