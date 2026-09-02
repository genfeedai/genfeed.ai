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

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsRelationshipsController } from '@api/collections/organizations/controllers/organizations-relationships.controller';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';

import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('OrganizationsRelationshipsController', () => {
  let controller: OrganizationsRelationshipsController;
  let _organizationsService: OrganizationsService;

  const mockUser = {
    id: 'user_123',
    brandId: 'clbrandorgrel0000000000001',
    organizationId: 'clorganizationrel0000000001',
    userId: 'cluserorgrel00000000000001',
  } as unknown as User;

  const mockServices = {
    analyticsAggregationService: {
      getOverviewMetrics: vi.fn().mockResolvedValue({
        totalPosts: 0,
        totalViews: 0,
      }),
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
    membersService: {
      findOne: vi.fn().mockResolvedValue(null),
    },
    organizationsService: {
      findOne: vi.fn().mockResolvedValue({
        id: 'clorganizationrel0000000001',
      }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsRelationshipsController],
      providers: [
        {
          provide: AnalyticsAggregationService,
          useValue: mockServices.analyticsAggregationService,
        },
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

  describe('findAllIngredients', () => {
    it('allows an organization owner without a membership row', async () => {
      mockServices.membersService.findOne.mockResolvedValueOnce(null);
      mockServices.organizationsService.findOne.mockResolvedValueOnce({
        id: 'clorganizationrel0000000001',
        userId: 'cluserorgrel00000000000001',
      });

      await controller.findAllIngredients(
        {} as never,
        'clorganizationrel0000000001',
        mockUser,
        {
          category: 'video',
          folderId: 'clfolderorgrel000000000001',
          format: 'mp4',
          search: 'launch',
        } as never,
      );

      expect(mockServices.membersService.findOne).toHaveBeenCalledWith({
        isActive: true,
        organizationId: 'clorganizationrel0000000001',
        userId: 'cluserorgrel00000000000001',
      });
      expect(mockServices.organizationsService.findOne).toHaveBeenCalledWith({
        id: 'clorganizationrel0000000001',
        userId: 'cluserorgrel00000000000001',
      });
      expect(mockServices.ingredientsService.findAll).toHaveBeenCalledWith(
        {
          include: { metadata: true },
          orderBy: { createdAt: -1 },
          where: {
            category: 'video',
            folderId: 'clfolderorgrel000000000001',
            isDeleted: false,
            metadata: {
              is: {
                extension: 'mp4',
                OR: [
                  {
                    label: { contains: 'launch', mode: 'insensitive' },
                  },
                  {
                    description: {
                      contains: 'launch',
                      mode: 'insensitive',
                    },
                  },
                ],
              },
            },
            organizationId: 'clorganizationrel0000000001',
          },
        },
        expect.objectContaining({ limit: 10, page: 1 }),
      );
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAnalytics', () => {
    it('should return organization analytics', async () => {
      const result = await controller.findAnalytics(
        {} as unknown as Request,
        'clorganizationrel0000000001',
        {},
      );

      expect(
        mockServices.analyticsAggregationService.getOverviewMetrics,
      ).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
