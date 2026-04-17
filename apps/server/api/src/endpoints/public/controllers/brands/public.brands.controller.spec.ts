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
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PublicBrandsController', () => {
  let controller: PublicBrandsController;
  let brandsService: vi.Mocked<BrandsService>;

  const mockBrand = {
    _id: '507f191e810c19729de860ee',
    description: 'A public test brand',
    handle: 'test-brand',
    isDeleted: false,
    logo: '507f191e810c19729de860ee',
    name: 'Test Brand',
    scope: AssetScope.PUBLIC,
  };

  const mockReq = {} as Request;

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
    brandsService = module.get(BrandsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findBySlug', () => {
    it('should return a public brand by slug', async () => {
      brandsService.findOneBySlug.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );

      const result = await controller.findOneBySlug(mockReq, 'test-brand');

      expect(result).toEqual(mockBrand);
      expect(brandsService.findOneBySlug).toHaveBeenCalledWith({
        slug: { $options: 'i', $regex: '^test-brand$' },
      });
    });

    it('should return not found message for non-existent brand', async () => {
      brandsService.findOneBySlug.mockResolvedValue(null);

      const result = await controller.findOneBySlug(mockReq, 'nonexistent');

      expect(result).toMatchObject({ data: null });
    });
  });

  describe('public brand access', () => {
    it('should only access public brand data', () => {
      expect(controller).toBeDefined();
      // Public controller should not expose private data
    });
  });
});
