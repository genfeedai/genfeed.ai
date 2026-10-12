import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateArticleDeliveryDto } from '@api/collections/long-form-deliveries/dto/create-article-delivery.dto';
import { LongFormDeliveriesService } from '@api/collections/long-form-deliveries/services/long-form-deliveries.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { assertApiKeyPublishingScope } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ApiKeyScope } from '@genfeedai/contracts';
import {
  ChannelTargetSerializer,
  ReleaseGroupSerializer,
} from '@genfeedai/serializers';
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * Article → connected Ghost / WordPress / Medium account (#6753). Each
 * delivery is a one-target scheduler release linked to the article.
 */
@AutoSwagger()
@ApiTags('Articles')
@FeatureFlag('publishing')
@OrganizationModule('publishing')
@Controller('articles')
export class ArticleDeliveriesController {
  constructor(
    private readonly longFormDeliveriesService: LongFormDeliveriesService,
  ) {}

  @TenantReadPolicy('selected')
  @Get(':articleId/deliveries')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('articleId') articleId: string,
  ) {
    // Same access as GET /articles/:id: the selected tenant and brand, and the
    // caller's own or organization-scoped articles unless a superadmin
    // override selected the organization.
    const readScope = resolveTenantReadScope(user);
    const targets = await this.longFormDeliveriesService.listArticleDeliveries(
      {
        brandId: readScope.brandId,
        organizationId: readScope.organizationId,
        ownerUserId: readScope.isOrganizationOverride
          ? undefined
          : extractRequestContext(user).userId,
      },
      articleId,
    );
    return serializeCollection(request, ChannelTargetSerializer, {
      docs: targets,
    });
  }

  @Post(':articleId/deliveries')
  @RequiredScopes(ApiKeyScope.POSTS_PUBLISH)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('articleId') articleId: string,
    @Body() dto: CreateArticleDeliveryDto,
  ) {
    assertApiKeyPublishingScope(user, 'publish');
    const release = await this.longFormDeliveriesService.deliverArticle(
      extractRequestContext(user),
      articleId,
      dto,
    );
    return serializeSingle(request, ReleaseGroupSerializer, release);
  }
}
