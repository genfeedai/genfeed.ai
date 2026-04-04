import type { BrandEntity } from '@api/collections/brands/entities/brand.entity';
import { BrandCreditsGuard } from '@api/helpers/guards/brand-credits/brand-credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import 'reflect-metadata';

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { BrandSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { REQUEST } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

// Mock utility functions
vi.mock('@genfeedai/helpers', async () => ({
  ...(await vi.importActual('@genfeedai/helpers')),
  getDeserializer: vi.fn((dto) => Promise.resolve(dto)),
}));

vi.mock('@helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
  setTopLinks: vi.fn((_req, opts) => opts),
}));

describe('BrandsController', () => {
  let controller: BrandsController;
  let brandsService: vi.Mocked<BrandsService>;
  let _loggerService: vi.Mocked<LoggerService>;

  const mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: new Types.ObjectId().toString(),
      isSuperAdmin: false,
      organization: new Types.ObjectId().toString(),
      user: new Types.ObjectId().toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockBrand = {
    _id: new Types.ObjectId(),
    description: 'A test brand',
    isDeleted: false,
    name: 'Test Brand',
    slug: 'test-brand',
    user: new Types.ObjectId(),
  };

  const mockRequest = {
    originalUrl: '/api/brands',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandsController],
      providers: [
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: BrandsService,
          useValue: {
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            findOneBySlug: vi.fn(),
            patch: vi.fn(),
            remove: vi.fn(),
          },
        },
        {
          provide: ActivitiesService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: VideosService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: ImagesService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: ArticlesService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: MusicsService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: CredentialsService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: IngredientsService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: LinksService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: OrganizationSettingsService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: PostsService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: AnalyticsAggregationService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(BrandCreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<BrandsController>(BrandsController);
    brandsService = module.get(BrandsService);
    _loggerService = module.get(LoggerService);

    vi.spyOn(BrandSerializer, 'serialize').mockImplementation((data) => ({
      data,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated brands', async () => {
      const mockResult = {
        docs: [mockBrand],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      };

      brandsService.findAll.mockResolvedValue(
        mockResult as unknown as AggregatePaginateResult<unknown>,
      );

      const query: BaseQueryDto = {
        isDeleted: false,
        limit: 10,
        page: 1,
        pagination: true,
      };

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(brandsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('should return a brand by id', async () => {
      const brandId = new Types.ObjectId().toString();
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );

      const result = await controller.findOne(mockRequest, mockUser, brandId);

      expect(brandsService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should not be decorated with cache metadata', () => {
      const cacheMetadata = Reflect.getMetadata(
        'cache',
        Object.getPrototypeOf(controller),
        'findOne',
      );

      expect(cacheMetadata).toBeUndefined();
    });
  });
});
