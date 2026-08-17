vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandEntity } from '@api/collections/brands/entities/brand.entity';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { PublicBrandsController } from '@api/endpoints/public/controllers/brands/public.brands.controller';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { AssetScope } from '@genfeedai/enums';
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
        { provide: ArticlesService, useValue: { findAll: vi.fn() } },
        { provide: ImagesService, useValue: { findAll: vi.fn() } },
        { provide: LinksService, useValue: { findAll: vi.fn() } },
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
    videosService = module.get(VideosService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
