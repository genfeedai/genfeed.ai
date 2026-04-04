vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_, __, result) => result),
  serializeSingle: vi.fn((_, __, data) => data),
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandsRelationshipsController } from '@api/collections/brands/controllers/relationships/brands-relationships.controller';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { REQUEST } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('BrandsRelationshipsController', () => {
  let controller: BrandsRelationshipsController;
  let _brandsService: BrandsService;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      isSuperAdmin: false,
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockBrand = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
    organization: new Types.ObjectId('507f1f77bcf86cd799439012'),
    user: new Types.ObjectId('507f1f77bcf86cd799439011'),
  };

  const mockServices = {
    activitiesService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
    analyticsAggregationService: {
      getOverviewMetrics: vi.fn().mockResolvedValue({
        totalPosts: 0,
        totalViews: 0,
        viewsGrowth: 0,
      }),
    },
    articlesService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
    brandsService: {
      findOne: vi.fn().mockResolvedValue(mockBrand),
    },
    credentialsService: {
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
    },
    imagesService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
    linksService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    musicsService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
    postsService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
    request: {
      params: {},
      query: {},
      user: mockUser,
    },
    videosService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandsRelationshipsController],
      providers: [
        {
          provide: REQUEST,
          useValue: mockServices.request,
        },
        {
          provide: ActivitiesService,
          useValue: mockServices.activitiesService,
        },
        {
          provide: AnalyticsAggregationService,
          useValue: mockServices.analyticsAggregationService,
        },
        { provide: ArticlesService, useValue: mockServices.articlesService },
        { provide: BrandsService, useValue: mockServices.brandsService },
        {
          provide: CredentialsService,
          useValue: mockServices.credentialsService,
        },
        { provide: ImagesService, useValue: mockServices.imagesService },
        { provide: LinksService, useValue: mockServices.linksService },
        { provide: LoggerService, useValue: mockServices.loggerService },
        { provide: MusicsService, useValue: mockServices.musicsService },
        { provide: PostsService, useValue: mockServices.postsService },
        { provide: VideosService, useValue: mockServices.videosService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BrandsRelationshipsController>(
      BrandsRelationshipsController,
    );
    _brandsService = module.get<BrandsService>(BrandsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findBrandVideos', () => {
    it('should return videos for brand', async () => {
      const result = await controller.findBrandVideos(
        {} as unknown as Request,
        '507f1f77bcf86cd799439013',
        mockUser,
        {},
      );

      expect(mockServices.videosService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findBrandAnalytics', () => {
    it('should return brand analytics', async () => {
      const result = await controller.findBrandAnalytics(
        {} as Request,
        '507f1f77bcf86cd799439013',
        {},
        mockUser,
      );

      expect(
        mockServices.analyticsAggregationService.getOverviewMetrics,
      ).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
