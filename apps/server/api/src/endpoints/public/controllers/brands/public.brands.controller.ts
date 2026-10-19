import { ArticlesService } from '@api/collections/articles/services/articles.service';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { customLabels } from '@api/helpers/utils/pagination.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetScope, IngredientStatus } from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import {
  ArticleSerializer,
  BrandSerializer,
  IngredientSerializer,
  LinkSerializer,
  VideoSerializer,
} from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import { PublicApiFilter } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

type BrandCollectionFailure = {
  data: unknown[];
  message: string;
  pagination?: null;
};

type BrandSingleFailure = {
  data: null;
  message: string;
};

@AutoSwagger()
@Public()
@Controller('public/brands')
export class PublicBrandsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly articlesService: ArticlesService,
    private readonly brandsService: BrandsService,
    private readonly imagesService: ImagesService,
    private readonly linksService: LinksService,
    private readonly referralsService: ReferralsService,
    private readonly videosService: VideosService,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  @Cache({
    keyGenerator: (req) =>
      `public:brands:highlighted:${req.query.isHighlighted ?? 'false'}:limit:${req.query.limit ?? '10'}`,
    tags: ['brands', 'public'],
    ttl: 1800, // 30 minutes
  })
  async findPublicBrands(
    @Req() request: Request,
    @Query('isHighlighted') isHighlighted?: string,
    @Query('limit') limit: string = '10',
  ): Promise<JsonApiCollectionResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const filter: PublicApiFilter = {
      isDeleted: false,
      scope: AssetScope.PUBLIC,
    };

    // Filter by isHighlighted if provided
    if (isHighlighted === 'true') {
      filter.isHighlighted = true;
    }

    this.logger.log(url, { query: { isHighlighted, limit } });

    const parsedLimit = Math.trunc(Number(limit));
    const pageSize = Math.min(
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10,
      100,
    ); // Cap at 100
    const aggregate = { where: filter, orderBy: { createdAt: -1 } };

    const options = {
      customLabels,
      limit: pageSize,
      page: 1,
      pagination: true,
    };

    const data = await this.brandsService.findAll(aggregate, options);
    data.docs = await this.attachPublicBrandAssets(data.docs);

    return serializeCollection(request, BrandSerializer, data);
  }

  @Get('slug')
  @Cache({
    keyGenerator: (req) => `brand:slug:${req.query.slug ?? ''}`,
    tags: ['brands', 'slugs'],
    ttl: 3600, // 1 hour
  })
  async findOneBySlug(
    @Req() request: Request,
    @Query('slug') slug: string,
  ): Promise<JsonApiSingleResponse | BrandSingleFailure> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!slug) {
      return { data: null, message: 'No slug provided' };
    }

    this.logger.log(url, { query: { slug } });
    // The scope gate belongs in the WHERE clause: `data.scope` carries the
    // Prisma casing ('PUBLIC') while `AssetScope.PUBLIC` is 'public', so a
    // post-fetch string comparison never matches. BaseService normalizes the
    // filter value for us — the same way the list endpoint above filters.
    const data = await this.brandsService.findOneBySlug({
      slug: { equals: slug, mode: 'insensitive' },
      isDeleted: false,
      scope: AssetScope.PUBLIC,
    });

    if (!data) {
      return { data: null, message: 'Brand not found' };
    }

    return serializeSingle(
      request,
      BrandSerializer,
      await this.attachPublicBrandAsset(data),
    );
  }

  @Get(':brandId')
  @Cache({
    keyGenerator: (req) => `public:brand:${req.params?.brandId ?? 'unknown'}`,
    tags: ['brands'],
    ttl: 1800, // 30 minutes
  })
  async findOne(
    @Req() request: Request,
    @Param('brandId') brandId: string,
  ): Promise<JsonApiSingleResponse | BrandSingleFailure> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isEntityId(brandId)) {
      return { data: null, message: 'Invalid brand ID format' };
    }

    this.logger.log(url, { params: { brandId } });
    // Scope is filtered in the query, not after the fetch — see findOneBySlug.
    const data = await this.brandsService.findOne({
      id: brandId,
      scope: AssetScope.PUBLIC,
    });

    if (!data) {
      return { data: null, message: 'Brand not found' };
    }

    return serializeSingle(
      request,
      BrandSerializer,
      await this.attachPublicBrandAsset(data),
    );
  }

  @Get(':brandId/referral')
  @Cache({
    keyGenerator: (req) =>
      `public:brand:${req.params?.brandId ?? 'unknown'}:referral`,
    tags: ['brands', 'referral'],
    ttl: 300, // 5 minutes: a newly created code should reach the profile soon
  })
  async findBrandReferral(
    @Param('brandId') brandId: string,
  ): Promise<{ data: { code: string | null } }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isEntityId(brandId)) {
      return { data: { code: null } };
    }

    this.logger.log(url, { params: { brandId } });

    const brand = await this.brandsService.findOne(
      { id: brandId, isDeleted: false, scope: AssetScope.PUBLIC },
      'none',
    );

    if (!brand) {
      return { data: { code: null } };
    }

    const code = await this.referralsService.findPublicCode({
      organizationId: brand.organizationId,
      userId: brand.userId,
    });

    return { data: { code } };
  }

  @Get(':brandId/links')
  @Cache({
    keyGenerator: (req) =>
      `public:brand:${req.params?.brandId ?? 'unknown'}:links:${req.query.sort ?? '-createdAt'}`,
    tags: ['brands', 'links'],
    ttl: 1800, // 30 minutes
  })
  async findBrandLinks(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Query('sort') sort: string = '-createdAt',
  ): Promise<JsonApiCollectionResponse | BrandCollectionFailure> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isEntityId(brandId)) {
      return { data: [], message: 'Invalid brand ID format' };
    }

    this.logger.log(url, { params: { brandId }, query: { sort } });

    // Verify brand exists
    const brand = await this.brandsService.findOne(
      { id: brandId, scope: AssetScope.PUBLIC },
      'none',
    );

    if (!brand) {
      return { data: [], message: 'Brand not found' };
    }

    const options = {
      customLabels,
      pagination: false,
    };

    const aggregate = {
      where: {
        brandId,
        isDeleted: false,
        scope: AssetScope.PUBLIC,
      },
      orderBy: { createdAt: -1, type: 1 },
    };

    const data = await this.linksService.findAll(aggregate, options);
    return serializeCollection(request, LinkSerializer, data);
  }

  @Get(':brandId/videos')
  @Cache({
    keyGenerator: (req) =>
      `public:brand:${req.params?.brandId ?? 'unknown'}:videos:${req.query.page ?? 1}:${req.query.limit ?? 20}:${req.query.sort ?? '-createdAt'}`,
    tags: ['brands', 'videos'],
    ttl: 900, // 15 minutes
  })
  async findBrandVideos(
    @Param('brandId') brandId: string,
    @Req() request: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('sort') sort: string = '-createdAt',
  ): Promise<JsonApiCollectionResponse | BrandCollectionFailure> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isEntityId(brandId)) {
      return {
        data: [],
        message: 'Invalid brand ID format',
        pagination: null,
      };
    }

    this.logger.log(url, { params: { brandId }, query: { limit, page, sort } });

    // Verify brand exists
    const brand = await this.brandsService.findOne(
      { id: brandId, scope: AssetScope.PUBLIC },
      'none',
    );
    if (!brand) {
      return { data: [], message: 'Brand not found', pagination: null };
    }

    const options = {
      customLabels,
      limit: Math.min(Number(limit), 50), // Max 50 per page
      page: Number(page),
      pagination: true,
    };

    const aggregate = {
      where: {
        brandId,
        isDeleted: false,
        scope: AssetScope.PUBLIC,
        status: IngredientStatus.GENERATED,
      },
      orderBy: { createdAt: -1, type: 1 },
    };

    const data = await this.videosService.findAll(aggregate, options);
    return serializeCollection(request, VideoSerializer, data);
  }

  @Get(':brandId/images')
  @Cache({
    keyGenerator: (req) =>
      `public:brand:${req.params?.brandId ?? 'unknown'}:images:${req.query.page ?? 1}:${req.query.limit ?? 20}:${req.query.sort ?? '-createdAt'}`,
    tags: ['brands', 'images'],
    ttl: 900, // 15 minutes
  })
  async findBrandImages(
    @Param('brandId') brandId: string,
    @Req() request: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('sort') sort: string = '-createdAt',
  ): Promise<JsonApiCollectionResponse | BrandCollectionFailure> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isEntityId(brandId)) {
      return {
        data: [],
        message: 'Invalid brand ID format',
        pagination: null,
      };
    }

    this.logger.log(url, { params: { brandId }, query: { limit, page, sort } });

    // Verify brand exists
    const brand = await this.brandsService.findOne(
      { id: brandId, scope: AssetScope.PUBLIC },
      'none',
    );

    if (!brand) {
      return { data: [], message: 'Brand not found', pagination: null };
    }

    const options = {
      customLabels,
      limit: Math.min(Number(limit), 50), // Max 50 per page
      page: Number(page),
      pagination: true,
    };

    const aggregate = {
      where: {
        brandId,
        isDeleted: false,
        scope: AssetScope.PUBLIC,
        status: IngredientStatus.GENERATED,
      },
      orderBy: { createdAt: -1, type: 1 },
    };

    const data = await this.imagesService.findAll(aggregate, options);
    return serializeCollection(request, IngredientSerializer, data);
  }

  @Get(':brandId/articles')
  @Cache({
    keyGenerator: (req) =>
      `public:brand:${req.params?.brandId ?? 'unknown'}:articles:${req.query.page ?? 1}:${req.query.limit ?? 20}:${req.query.sort ?? '-createdAt'}`,
    tags: ['brands', 'articles'],
    ttl: 900, // 15 minutes
  })
  async findBrandArticles(
    @Param('brandId') brandId: string,
    @Req() request: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('sort') sort: string = '-createdAt',
  ): Promise<JsonApiCollectionResponse | BrandCollectionFailure> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isEntityId(brandId)) {
      return {
        data: [],
        message: 'Invalid brand ID format',
        pagination: null,
      };
    }

    this.logger.log(url, { params: { brandId }, query: { limit, page, sort } });

    // Verify brand exists
    const brand = await this.brandsService.findOne(
      { id: brandId, scope: AssetScope.PUBLIC },
      'none',
    );

    if (!brand) {
      return { data: [], message: 'Brand not found', pagination: null };
    }

    const options = {
      customLabels,
      limit: Math.min(Number(limit), 50), // Max 50 per page
      page: Number(page),
      pagination: true,
    };

    const aggregate = {
      where: {
        brandId,
        isDeleted: false,
        scope: AssetScope.PUBLIC,
        ...(await this.articlesService.publicArticleScope.buildWhere()),
      },
      orderBy: { createdAt: -1, publishedAt: -1 },
    };

    const data = await this.articlesService.findAll(aggregate, options);
    return serializeCollection(request, ArticleSerializer, data);
  }

  /**
   * Resolve the brand's logo and banner onto a public response.
   *
   * The Brand table has no logo/banner columns — they are `Asset` rows keyed by
   * `parentBrandId` — so a row served straight from `findOne` carries neither,
   * and the public profile rendered without an avatar or banner. Only the
   * assets are attached here: credentials stay out of public payloads.
   */
  private async attachPublicBrandAsset(
    brand: BrandDocument,
  ): Promise<BrandDocument> {
    const [decorated] = await this.attachPublicBrandAssets([brand]);

    return decorated ?? brand;
  }

  private async attachPublicBrandAssets(
    brands: BrandDocument[],
  ): Promise<BrandDocument[]> {
    const brandsByOrganization = new Map<string, BrandDocument[]>();

    for (const brand of brands) {
      const organizationId = brand.organizationId;

      if (typeof organizationId !== 'string' || !organizationId) {
        continue;
      }

      const group = brandsByOrganization.get(organizationId) ?? [];
      group.push(brand);
      brandsByOrganization.set(organizationId, group);
    }

    for (const [organizationId, group] of brandsByOrganization) {
      await this.brandsService.attachBrandKitAssetRelations(
        group,
        organizationId,
      );
    }

    return brands;
  }
}
