import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import type { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import { UpdateArticleDto } from '@api/collections/articles/dto/update-article.dto';
import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import {
  ARTICLE_PREVIEW_TOKEN_TTL_SECONDS,
  createArticlePreviewToken,
} from '@api/helpers/utils/article-preview/article-preview-token.util';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { ArticleSerializer } from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('articles')
@UseInterceptors(CreditsInterceptor)
@UseGuards(RolesGuard)
export class ArticlesController extends BaseCRUDController<
  ArticleDocument,
  CreateArticleDto,
  UpdateArticleDto,
  ArticlesQueryDto
> {
  constructor(
    public readonly articlesService: ArticlesService,
    private readonly configService: ConfigService,
    public readonly loggerService: LoggerService,
  ) {
    // ArticleSerializer would need to be created, using null for now
    super(loggerService, articlesService, ArticleSerializer, 'Article', [
      'user',
      'organization',
      'brand',
      'tags',
    ]);
  }

  /**
   * Override buildFindAllQuery to include organization and brand filtering
   * Uses ArticleFilterUtil for consistent filtering patterns
   */
  public buildFindAllQuery(user: User, query: ArticlesQueryDto) {
    const scope = CollectionFilterUtil.resolveAuthorizedTenantQuery(
      query,
      user,
      getIsSuperAdmin(user),
    );

    return ArticleFilterUtil.buildArticlequery(
      {
        category: query.category,
        scope: query.scope,
        search: query.search,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        status: query.status,
        tag: query.tag,
      },
      {
        brandId: scope.brandId ?? user.brandId,
        isDeleted: query.isDeleted ?? false,
        organizationId: scope.organizationId ?? user.organizationId,
        userId: user.userId ?? user.id,
      },
    );
  }

  // Inherits create(), findAll(), and remove(:id) from BaseCRUDController

  /**
   * Override findOne to include evaluation lookup
   */
  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') articleId: string,
  ): Promise<JsonApiSingleResponse> {
    const isSuperAdmin = getIsSuperAdmin(user, request);

    // Scope the database read for regular users instead of hydrating another
    // organization's article and rejecting it after the query.
    const pipeline = {
      where: {
        id: articleId,
        isDeleted: false,
        ...(!isSuperAdmin && {
          organizationId: user.organizationId.toString(),
        }),
      },
    };

    // Execute aggregation using service's findAll method
    const results = await this.articlesService.findAll(pipeline, {
      pagination: false,
    });

    if (!results?.docs || results.docs.length === 0) {
      ErrorResponse.notFound(this.entityName, articleId);
    }

    const article = results.docs[0];

    // Check organization access
    if (
      article.organizationId !== user.organizationId.toString() &&
      !isSuperAdmin
    ) {
      ErrorResponse.notFound(this.entityName, articleId);
    }

    return serializeSingle(request, this.serializer, article);
  }

  /**
   * Mint a shareable preview link for an unpublished article.
   *
   * The link carries a signed, slug-bound, expiring token — the only thing the
   * public articles endpoint accepts as authorisation to serve unpublished
   * content. Minting is organization-scoped; reading the resulting link is not,
   * so treat the returned URL as a bearer credential.
   */
  @Get(':articleId/preview-links')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createPreviewLink(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('articleId') articleId: string,
  ): Promise<{ expiresInSeconds: number; url: string }> {
    const article = await this.articlesService.findOne({
      id: articleId,
    });

    if (!article) {
      ErrorResponse.notFound(this.entityName, articleId);
    }

    if (
      article.organizationId !== user.organizationId.toString() &&
      !getIsSuperAdmin(user, request)
    ) {
      ErrorResponse.notFound(this.entityName, articleId);
    }

    const publicUrl = (
      this.configService.get('GENFEEDAI_PUBLIC_URL') as string | undefined
    )?.replace(/\/$/, '');

    const signingKey = this.configService.get('TOKEN_ENCRYPTION_KEY') as
      | string
      | undefined;

    const slug = article.slug ? String(article.slug) : undefined;

    const token = slug
      ? createArticlePreviewToken(slug, signingKey)
      : undefined;

    if (!slug || !publicUrl || !token) {
      throw new BadRequestException(
        'This article cannot be previewed: it needs a slug, a configured public URL, and a configured signing key.',
      );
    }

    return {
      expiresInSeconds: ARTICLE_PREVIEW_TOKEN_TTL_SECONDS,
      url: `${publicUrl}/articles/${slug}?previewToken=${token}`,
    };
  }

  /**
   * Override patch to use ArticlesService.update() which handles publishing logic
   */
  @Patch(':articleId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('articleId') articleId: string,
    @Body() updateDto: UpdateArticleDto,
  ) {
    // A `restoreFromVersionId` in the patch body reverts the article to a prior
    // version (prompt snapshot). The restore path carries its own
    // ownership/version-exists guards; other update fields are ignored.
    const data: ArticleDocument = updateDto.restoreFromVersionId
      ? await this.articlesService.restoreArticleVersion(
          articleId,
          updateDto.restoreFromVersionId,
          user.userId ?? user.id,
          user.organizationId,
          user.brandId,
        )
      : await this.articlesService.update(
          articleId,
          updateDto,
          user.userId ?? user.id,
          user.organizationId,
          user.brandId,
        );

    return serializeSingle(request, this.serializer, data);
  }

  @Get(':articleId/versions')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getVersions(
    @Param('articleId') articleId: string,
    @CurrentUser() user: User,
  ) {
    return await this.articlesService.getArticleVersions(
      articleId,
      user.userId ?? user.id,
      user.organizationId,
      user.brandId,
    );
  }
}
