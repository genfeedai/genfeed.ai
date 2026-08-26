import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostRetryService } from '@api/collections/posts/services/post-retry.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { assertApiKeyPublishingScope } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ApiKeyScope } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { PostSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@Controller('posts')
@UseGuards(RolesGuard)
export class PostsRetryController {
  constructor(
    readonly logger: LoggerService,
    private readonly postRetryService: PostRetryService,
  ) {}

  @Post(':postId/retry')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'PostsOperationsController.retryPost',
    summary: 'retryPost',
  })
  async retryPost(
    @Req() request: Request,
    @Param('postId') postId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    assertApiKeyPublishingScope(user, 'schedule');
    const post = await this.postRetryService.retryPost(
      postId,
      user.organizationId,
    );

    return serializeSingle(request, PostSerializer, post);
  }
}
