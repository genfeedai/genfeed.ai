import { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { withholdGatedContent } from '@api/collections/articles/utils/article-preview.util';
import { PublicArticleGenerationsService } from '@api/endpoints/public/services/public-article-generations.service';
import { PublicViewsService } from '@api/endpoints/public/services/public-views.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { verifyArticlePreviewToken } from '@api/helpers/utils/article-preview/article-preview-token.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import {
  PUBLIC_ARTICLE_BRAND_INCLUDE,
  stripPrivateBrand,
} from '@api/helpers/utils/public-brand/public-brand-filter.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import {
  PublicArticleGenerationSerializer,
  PublicArticleSerializer,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { Public } from '@libs/decorators/public.decorator';
import { PrismaWhereQuery } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
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
    private readonly publicViewsService: PublicViewsService,
    private readonly publicArticleGenerationsService: PublicArticleGenerationsService,
  ) {}

  /**
   * The generations a published article embeds as blocks: each one's output,
   * model and, unless the author hid it, prompt. Only public assets of the
   * article's own organization are returned.
   */
  @Get(':articleId/generations')
  @Cache({
    keyGenerator: (req) =>
      `public:article:generations:${req.params?.articleId ?? 'unknown'}`,
    tags: ['articles', 'public'],
    ttl: 60,
  })
  async findArticleGenerations(
    @Req() request: Request,
    @Param('articleId') articleId: string,
  ): Promise<JsonApiCollectionResponse> {
    const docs = isEntityId(articleId)
      ? await this.publicArticleGenerationsService.findForArticle(
          articleId,
          await this.articlesService.publicArticleScope.buildWhere(),
        )
      : [];
    return serializeCollection(request, PublicArticleGenerationSerializer, {
      docs,
    });
  }

  /** Counts a reader's view of a published article, once a day per visitor. */
  @Post(':articleId/views')
  @RateLimit({ limit: 30, scope: 'ip', windowMs: 60_000 })
  async recordView(
    @Req() request: Request,
    @Param('articleId') articleId: string,
  ): Promise<{ data: { views: number } | null }> {
    if (!isEntityId(articleId)) {
      return { data: null };
    }
    const userAgent = request.headers['user-agent'];
    const views = await this.publicViewsService.recordArticle(
      articleId,
      await this.articlesService.publicArticleScope.buildWhere(),
      {
        ip: request.ip ?? '',
        userAgent: typeof userAgent === 'string' ? userAgent : '',
      },
    );
    return { data: views === null ? null : { views } };
  }

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
    @Query('brand') brand?: string,
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
      ...(await this.articlesService.publicArticleScope.buildWhere()),
    };

    // Add search filter
    if (search) {
      matchQuery.OR = [
        { label: { mode: 'insensitive', contains: search } },
        { summary: { mode: 'insensitive', contains: search } },
        // A paid article's body is not public, so search skips it (#9718).
        {
          accessLevel: 'public',
          content: { mode: 'insensitive', contains: search },
        },
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

    // Brand settings send `?brand=<id>`. ValidationPipe whitelist-strips that
    // alias off ArticlesQueryDto (which declares `brandId`), so bind it the
    // same way public videos/images do. Without this, every brand sees the
    // whole public corpus.
    // `isEntityId` trims before validating, so the raw value can still carry
    // whitespace that an exact `brandId` match would never find.
    const scopedBrandId =
      brand && isEntityId(brand)
        ? brand.trim()
        : brandId && isEntityId(brandId)
          ? brandId.trim()
          : undefined;
    if (scopedBrandId) {
      matchQuery.brandId = scopedBrandId;
    }

    const aggregate = {
      include: PUBLIC_ARTICLE_BRAND_INCLUDE,
      orderBy: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      where: matchQuery,
    };

    const data = await this.articlesService.findAll(aggregate, options);
    data.docs = data.docs.map((doc) =>
      withholdGatedContent(stripPrivateBrand(doc)),
    );
    return serializeCollection(request, PublicArticleSerializer, data);
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

    // Unpublished articles are only readable with a signed, article-bound,
    // expiring preview token. An unsigned request always sees published-only.
    const previewArticleId = verifyArticlePreviewToken(
      previewToken,
      slug,
      this.configService.get('TOKEN_ENCRYPTION_KEY') as string | undefined,
    );

    this.logger.log(url, {
      params: { isPreview: Boolean(previewArticleId), slug },
    });

    const article = await this.articlesService.findPublicArticleBySlug(
      slug,
      previewArticleId,
    );

    if (!article) {
      return serializeSingle(request, PublicArticleSerializer, { data: null });
    }

    // A signed preview is the author checking their draft: show all of it.
    return serializeSingle(
      request,
      PublicArticleSerializer,
      previewArticleId ? article : withholdGatedContent(article),
    );
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
      ...(await this.articlesService.publicArticleScope.buildWhere()),
    });

    if (!article) {
      return returnNotFound(this.constructorName, articleId);
    }

    return serializeSingle(
      request,
      PublicArticleSerializer,
      withholdGatedContent(article),
    );
  }
}
