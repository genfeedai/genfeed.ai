vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw new HttpException(response, 400);
  }),
  returnForbidden: vi.fn(),
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
    statusCode: 404,
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsRelationshipsController } from '@api/collections/organizations/controllers/organizations-relationships.controller';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('OrganizationsRelationshipsController', () => {
  let controller: OrganizationsRelationshipsController;
  let _organizationsService: OrganizationsService;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockServices = {
    activitiesService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
    analyticsAggregationService: {
      getOverviewMetrics: vi.fn().mockResolvedValue({
        totalPosts: 0,
        totalViews: 0,
      }),
    },
    brandsService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
    credentialsService: {
      findAll: vi
        .fn()
        .mockResolvedValue({ docs: [{ total: 0 }], totalDocs: 0 }),
    },
    ingredientsService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    membersService: {},
    organizationsService: {
      findOne: vi.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
      }),
    },
    postsService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
    tagsService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
    videosService: {
      findAll: vi.fn().mockResolvedValue({ docs: [], total: 0 }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsRelationshipsController],
      providers: [
        {
          provide: ActivitiesService,
          useValue: mockServices.activitiesService,
        },
        {
          provide: AnalyticsAggregationService,
          useValue: mockServices.analyticsAggregationService,
        },
        { provide: BrandsService, useValue: mockServices.brandsService },
        {
          provide: CredentialsService,
          useValue: mockServices.credentialsService,
        },
        {
          provide: IngredientsService,
          useValue: mockServices.ingredientsService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
        {
          provide: MembersService,
          useValue: mockServices.membersService,
        },
        {
          provide: OrganizationsService,
          useValue: mockServices.organizationsService,
        },
        { provide: PostsService, useValue: mockServices.postsService },
        {
          provide: TagsService,
          useValue: mockServices.tagsService,
        },
        { provide: VideosService, useValue: mockServices.videosService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrganizationsRelationshipsController>(
      OrganizationsRelationshipsController,
    );
    _organizationsService =
      module.get<OrganizationsService>(OrganizationsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAllBrands', () => {
    it('should return brands for organization', async () => {
      const result = await controller.findAllBrands(
        {} as unknown as Request,
        '507f1f77bcf86cd799439012',
        mockUser,
        {},
      );

      expect(result).toBeDefined();
    });
  });

  describe('findAnalytics', () => {
    it('should return organization analytics', async () => {
      const result = await controller.findAnalytics(
        {} as unknown as Request,
        '507f1f77bcf86cd799439012',
        {},
      );

      expect(
        mockServices.analyticsAggregationService.getOverviewMetrics,
      ).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
