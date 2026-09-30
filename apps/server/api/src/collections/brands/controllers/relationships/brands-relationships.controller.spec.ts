vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_, __, result) => result),
  serializeSingle: vi.fn((_, __, data) => data),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsRelationshipsController } from '@api/collections/brands/controllers/relationships/brands-relationships.controller';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';

import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { REQUEST } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('BrandsRelationshipsController', () => {
  let controller: BrandsRelationshipsController;
  let _brandsService: BrandsService;

  const brandId = testId('brand');
  const organizationId = testId('org');
  const userId = testId('user');

  const mockUser = {
    id: 'user_123',
    brandId,
    isSuperAdmin: false,
    organizationId,
    userId,
  } as unknown as User;

  const mockBrand = {
    _id: brandId,
    organization: organizationId,
    user: userId,
  };

  const mockServices = {
    analyticsAggregationService: {
      getOverviewMetrics: vi.fn().mockResolvedValue({
        totalPosts: 0,
        totalViews: 0,
        viewsGrowth: 0,
      }),
    },
    brandsService: {
      findOne: vi.fn().mockResolvedValue(mockBrand),
    },
    credentialsService: {
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
    },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    request: {
      params: {},
      query: {},
      user: mockUser,
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
          provide: AnalyticsAggregationService,
          useValue: mockServices.analyticsAggregationService,
        },
        { provide: BrandsService, useValue: mockServices.brandsService },
        {
          provide: CredentialsService,
          useValue: mockServices.credentialsService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
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

  describe('findBrandAnalytics', () => {
    it('should return brand analytics', async () => {
      const result = await controller.findBrandAnalytics(
        {} as Request,
        brandId,
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
