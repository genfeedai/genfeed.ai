import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RetryAccountGenerationDto } from '@api/collections/posts/dto/retry-account-generation.dto';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { PostSerializer } from '@genfeedai/serializers';
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@FeatureFlag('publishing')
@OrganizationModule('publishing')
@Controller('posts')
@UseGuards(RolesGuard)
export class PostsAccountGenerationRetryController {
  constructor(private readonly postGenerationService: PostGenerationService) {}

  /**
   * Retries one failed account-generation placeholder (a thread is retried
   * whole) under a new request key. The retry's credit hold is taken up front
   * and the dispatch finishes in the background, like the original run.
   */
  @Post(':postId/generation-retries')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async retryAccountGeneration(
    @Req() request: Request,
    @Param('postId') postId: string,
    @Body() dto: RetryAccountGenerationDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const post = await this.postGenerationService.retryAccountContentGeneration(
      postId,
      dto.requestKey,
      user,
    );
    return serializeSingle(request, PostSerializer, post);
  }
}
