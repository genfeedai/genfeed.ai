import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  QuoteStoryboardAssetsDto,
  StartStoryboardAssetsDto,
} from '@api/collections/content-runs/dto/storyboard-run.dto';
import { StoryboardAssetBibleService } from '@api/collections/content-runs/services/storyboard-asset-bible.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ApiKeyScope } from '@genfeedai/contracts';
import { StoryboardRunSerializer } from '@genfeedai/serializers';
import { Body, Controller, Param, Post, Req } from '@nestjs/common';

/** Images of a storyboard's asset bible (#9616). */
@Controller('brands/:brandId/storyboard-runs')
@OrganizationModule('storyboard')
export class StoryboardAssetBibleController {
  constructor(private readonly assets: StoryboardAssetBibleService) {}

  /** Prices one generation call for an asset bible entry. Spends nothing. */
  @Post(':runId/assets/quote')
  quoteAssets(
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: QuoteStoryboardAssetsDto,
  ) {
    return this.assets.quote(user.organizationId, brandId, runId, body);
  }

  @Post(':runId/assets')
  @RequiredScopes(ApiKeyScope.IMAGES_CREATE)
  async startAssets(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: StartStoryboardAssetsDto,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.assets.start(
        user.organizationId,
        brandId,
        runId,
        user.userId,
        body,
      ),
    );
  }

  @Post(':runId/assets/reconcile')
  async reconcileAssets(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.assets.reconcile(user.organizationId, brandId, runId),
    );
  }
}
