vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandEntity } from '@api/collections/brands/entities/brand.entity';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { PublicBrandsController } from '@api/endpoints/public/controllers/brands/public.brands.controller';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { AssetScope } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PublicBrandsController', () => {
  const brandId = testId('brand');
  let controller: PublicBrandsController;
  let articlesService: vi.Mocked<ArticlesService>;
  let brandsService: vi.Mocked<BrandsService>;
  let imagesService: vi.Mocked<ImagesService>;
  let linksService: vi.Mocked<LinksService>;
  let referralsService: vi.Mocked<ReferralsService>;
  let videosService: vi.Mocked<VideosService>;

  // Rows come back with the Prisma enum casing ('PUBLIC'), not the TS enum
  // value ('public'). Mocking the TS value hid a production bug where the
  // controller compared a row value against `AssetScope.PUBLIC` after the
  // fetch and always rejected genuinely public brands.
  const PRISMA_SCOPE_PUBLIC = 'PUBLIC';
  const PRISMA_SCOPE_USER = 'USER';

  const mockBrand = {
    id: brandId,
    description: 'A public test brand',
    handle: 'test-brand',
    isDeleted: false,
    logo: brandId,
    name: 'Test Brand',
    scope: PRISMA_SCOPE_PUBLIC,
  };

  const mockReq = {} as Request;

  /**
   * Stands in for the database honouring the controller's scope filter.
   * `storedScope` is the value Postgres holds for the row; the filter value the
   * controller supplies is the TS enum ('public'), which BaseService normalizes
   * to the Prisma casing before the query runs. The row is returned only when
   * the two agree — so a controller that drops the scope filter fails here.
   */
  const scopeFilteringFindOne =
    (storedScope: string) =>
    async (filter: Record<string, unknown>): Promise<BrandEntity | null> => {
      const requested = filter.scope;

      if (typeof requested !== 'string') {
        throw new Error('Public brand lookups must constrain scope');
      }

      const normalized = requested.toUpperCase();

      return normalized === storedScope
        ? ({ ...mockBrand, scope: storedScope } as unknown as BrandEntity)
        : null;
    };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicBrandsController],
      providers: [
        {
          provide: BrandsService,
          useValue: {
            findAll: vi.fn(),
            findOne: vi.fn(),
            findOneBySlug: vi.fn(),
          },
        },
        {
          provide: ArticlesService,
          useValue: {
            publicArticleScope: {
              buildWhere: vi.fn(async () => ({
                organizationId: 'genfeed-org',
                publishedAt: { lte: new Date() },
                status: 'PUBLISHED',
              })),
            },
            findAll: vi.fn(),
          },
        },
        { provide: ImagesService, useValue: { findAll: vi.fn() } },
        { provide: LinksService, useValue: { findAll: vi.fn() } },
        {
          provide: ReferralsService,
          useValue: { findPublicCode: vi.fn() },
        },
        { provide: VideosService, useValue: { findAll: vi.fn() } },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PublicBrandsController>(PublicBrandsController);
    articlesService = module.get(ArticlesService);
    brandsService = module.get(BrandsService);
    imagesService = module.get(ImagesService);
    linksService = module.get(LinksService);
    referralsService = module.get(ReferralsService);
    videosService = module.get(VideosService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findPublicBrands', () => {
    it('applies the requested limit as the page size', async () => {
      brandsService.findAll.mockResolvedValue({ docs: [mockBrand] } as never);

      await controller.findPublicBrands(mockReq, undefined, '3');

      expect(brandsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isDeleted: false }),
        }),
        expect.objectContaining({ limit: 3, page: 1, pagination: true }),
      );
    });

    it('caps the limit at 100 and falls back to 10 for junk input', async () => {
      brandsService.findAll.mockResolvedValue({ docs: [] } as never);

      await controller.findPublicBrands(mockReq, undefined, '5000');
      await controller.findPublicBrands(mockReq, undefined, 'abc');

      expect(brandsService.findAll).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.objectContaining({ limit: 100 }),
      );
      expect(brandsService.findAll).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.objectContaining({ limit: 10 }),
      );
    });
  });

  describe('findBySlug', () => {
    it('queries an exact case-insensitive slug and excludes deleted brands', async () => {
      brandsService.findOneBySlug.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );

      const result = await controller.findOneBySlug(mockReq, 'test-brand');

      expect(result).toEqual(mockBrand);
      expect(brandsService.findOneBySlug).toHaveBeenCalledWith({
        slug: { equals: 'test-brand', mode: 'insensitive' },
        isDeleted: false,
        scope: AssetScope.PUBLIC,
      });
    });

    it('returns a brand stored with the PUBLIC scope value', async () => {
      brandsService.findOneBySlug.mockImplementation(
        scopeFilteringFindOne(PRISMA_SCOPE_PUBLIC),
      );

      const result = await controller.findOneBySlug(mockReq, 'test-brand');

      expect(result).toEqual(mockBrand);
    });

    it('returns not found for a brand stored with the USER scope value', async () => {
      brandsService.findOneBySlug.mockImplementation(
        scopeFilteringFindOne(PRISMA_SCOPE_USER),
      );

      const result = await controller.findOneBySlug(mockReq, 'test-brand');

      expect(result).toMatchObject({ data: null });
    });

    it('should return not found message for non-existent brand', async () => {
      brandsService.findOneBySlug.mockResolvedValue(null);

      const result = await controller.findOneBySlug(mockReq, 'nonexistent');

      expect(result).toMatchObject({ data: null });
    });
  });

  describe('findOne', () => {
    it('constrains scope in the query and serializes a PUBLIC brand row', async () => {
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );

      const result = await controller.findOne(mockReq, brandId);

      expect(brandsService.findOne).toHaveBeenCalledWith({
        id: brandId,
        scope: AssetScope.PUBLIC,
      });
      expect(result).toEqual(mockBrand);
    });

    it('returns not found for a brand stored with the USER scope value', async () => {
      brandsService.findOne.mockImplementation(
        scopeFilteringFindOne(PRISMA_SCOPE_USER),
      );

      const result = await controller.findOne(mockReq, brandId);

      expect(result).toMatchObject({ data: null });
    });

    it('rejects a malformed brand id before querying', async () => {
      const result = await controller.findOne(mockReq, 'not-an-id');

      expect(brandsService.findOne).not.toHaveBeenCalled();
      expect(result).toMatchObject({ data: null });
    });
  });

  describe('findBrandReferral', () => {
    it('returns the code of the public brand owner organization', async () => {
      brandsService.findOne.mockResolvedValue({
        ...mockBrand,
        organizationId: 'org_profile',
        userId: 'user_owner',
      } as unknown as BrandEntity);
      referralsService.findPublicCode.mockResolvedValue('owner2345xyz');

      await expect(controller.findBrandReferral(brandId)).resolves.toEqual({
        data: { code: 'owner2345xyz' },
      });

      expect(brandsService.findOne).toHaveBeenCalledWith(
        { id: brandId, isDeleted: false, scope: AssetScope.PUBLIC },
        'none',
      );
      expect(referralsService.findPublicCode).toHaveBeenCalledWith({
        organizationId: 'org_profile',
        userId: 'user_owner',
      });
    });

    it('returns no code for a brand that is not public', async () => {
      brandsService.findOne.mockResolvedValue(null);

      await expect(controller.findBrandReferral(brandId)).resolves.toEqual({
        data: { code: null },
      });
      expect(referralsService.findPublicCode).not.toHaveBeenCalled();
    });

    it('rejects a malformed brand id before querying', async () => {
      await expect(controller.findBrandReferral('not an id')).resolves.toEqual({
        data: { code: null },
      });
      expect(brandsService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findBrandArticles', () => {
    it('queries public brand articles with persisted status values', async () => {
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );
      articlesService.findAll.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      } as never);

      await controller.findBrandArticles(brandId, mockReq);

      expect(articlesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId,
            isDeleted: false,
            organizationId: 'genfeed-org',
            publishedAt: { lte: expect.any(Date) },
            scope: AssetScope.PUBLIC,
            status: 'PUBLISHED',
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('public brand asset filters', () => {
    it('uses brandId for links, videos, images, and articles', async () => {
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );
      linksService.findAll.mockResolvedValue({ docs: [] } as never);
      videosService.findAll.mockResolvedValue({ docs: [] } as never);
      imagesService.findAll.mockResolvedValue({ docs: [] } as never);
      articlesService.findAll.mockResolvedValue({ docs: [] } as never);

      await controller.findBrandLinks(mockReq, brandId);
      await controller.findBrandVideos(brandId, mockReq);
      await controller.findBrandImages(brandId, mockReq);
      await controller.findBrandArticles(brandId, mockReq);

      for (const findAll of [
        linksService.findAll,
        videosService.findAll,
        imagesService.findAll,
        articlesService.findAll,
      ]) {
        expect(findAll).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ brandId }),
          }),
          expect.any(Object),
        );
        expect(findAll).not.toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ brand: expect.anything() }),
          }),
          expect.any(Object),
        );
      }
    });
  });
});
