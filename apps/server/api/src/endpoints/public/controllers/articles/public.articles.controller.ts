import { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ArticleStatus } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { ArticleSerializer } from '@genfeedai/serializers';
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
    private readonly logger: LoggerService,
  ) {}

  @Get()
  @Cache({
    keyGenerator: (req) => `public:articles:${JSON.stringify(req.query)}`,
    tags: ['articles', 'public'],
    ttl: 600, // 10 minutes
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
      brand,
      sortBy = 'publishedAt',
      sortOrder = 'desc',
    } = query;

    const matchQuery: PrismaWhereQuery = {
      isDeleted: false,
      publishedAt: { not: null },
      status: ArticleStatus.PUBLIC,
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

    // Add tag filter
    if (tag) {
      matchQuery.tags = tag;
    }

    // Filter by brand if provided
    if (brand) {
      matchQuery.brand = brand;
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
    ttl: 1800, // 30 minutes
  })
  async findPublicArticleBySlug(
    @Req() request: Request,
    @Param('slug') slug: string,
    @Query('isPreview') isPreview?: string,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.logger.log(url, { params: { isPreview, slug } });

    const article = await this.articlesService.findPublicArticleBySlug(
      slug,
      isPreview === 'true',
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
    ttl: 1800, // 30 minutes
  })
  async findPublicArticleById(
    @Req() request: Request,
    @Param('articleId') articleId: string,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(url, { params: { articleId } });

    const article = await this.articlesService.findOne({
      _id: articleId,
      isDeleted: false,
      publishedAt: { not: null },
      status: ArticleStatus.PUBLIC,
    });

    if (!article) {
      return returnNotFound(this.constructorName, articleId);
    }

    return serializeSingle(request, ArticleSerializer, article);
  }
}
