import { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { verifyArticlePreviewToken } from '@api/helpers/utils/article-preview/article-preview-token.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { ArticleSerializer } from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { Public } from '@libs/decorators/public.decorator';
import { PrismaWhereQuery } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Public()
@Controller('public/articles')
export class PublicArticlesController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly articlesService: ArticlesService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  @Cache({
    keyGenerator: (req) => `public:articles:${JSON.stringify(req.query)}`,
    tags: ['articles', 'public'],
    // Scheduled releases use `publishedAt` as their clock. Keep the public list
    // close to that boundary instead of hiding a newly released article behind
    // a ten-minute stale response.
    ttl: 60,
  })
  async findPublicArticles(
    @Req() request: Request,
    @Query() query: ArticlesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(url, { query });

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const {
      search,
      category,
      tag,
      brandId,
      sortBy = 'publishedAt',
      sortOrder = 'desc',
    } = query;

    const matchQuery: PrismaWhereQuery = {
      isDeleted: false,
      ...ArticleFilterUtil.buildPublicArticleVisibilityFilter(),
    };

    // Add search filter
    if (search) {
      matchQuery.OR = [
        { label: { mode: 'insensitive', contains: search } },
        { summary: { mode: 'insensitive', contains: search } },
        { content: { mode: 'insensitive', contains: search } },
      ];
    }

    // Add category filter
    if (category) {
      matchQuery.category = category;
    }

    // Add tag filter. `tags` is a Tag[] relation, so it takes a relation
    // filter (`{ some: { id } }`), never a bare scalar — Prisma rejects the
    // scalar form outright, which used to 500 every `?tag=` request.
    Object.assign(matchQuery, ArticleFilterUtil.buildTagFilter(tag));

    // Filter by brand if provided
    if (brandId) {
      matchQuery.brandId = brandId;
    }

    const aggregate = {
      where: matchQuery,
      orderBy: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
    };

    const data = await this.articlesService.findAll(aggregate, options);
    return serializeCollection(request, ArticleSerializer, data);
  }

  @Get('slug/:slug')
  @Cache({
    keyGenerator: (req) =>
      `public:article:slug:${req.params?.slug ?? 'unknown'}`,
    tags: ['articles', 'public'],
    ttl: 60,
  })
  async findPublicArticleBySlug(
    @Req() request: Request,
    @Param('slug') slug: string,
    @Query('previewToken') previewToken?: string,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Unpublished articles are only readable with a signed, slug-bound,
    // expiring preview token. An unsigned request always sees published-only.
    const isPreview = verifyArticlePreviewToken(
      previewToken,
      slug,
      this.configService.get('TOKEN_ENCRYPTION_KEY') as string | undefined,
    );

    this.logger.log(url, { params: { isPreview, slug } });

    const article = await this.articlesService.findPublicArticleBySlug(
      slug,
      isPreview,
    );

    if (!article) {
      return serializeSingle(request, ArticleSerializer, { data: null });
    }

    return serializeSingle(request, ArticleSerializer, article);
  }

  @Get(':articleId')
  @Cache({
    keyGenerator: (req) =>
      `public:article:${req.params?.articleId ?? 'unknown'}`,
    tags: ['articles'],
    ttl: 60,
  })
  async findPublicArticleById(
    @Req() request: Request,
    @Param('articleId') articleId: string,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(url, { params: { articleId } });

    const article = await this.articlesService.findOne({
      id: articleId,
      ...ArticleFilterUtil.buildPublicArticleVisibilityFilter(),
    });

    if (!article) {
      return returnNotFound(this.constructorName, articleId);
    }

    return serializeSingle(request, ArticleSerializer, article);
  }
}
