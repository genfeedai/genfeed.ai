vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
    statusCode: 404,
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

vi.mock(
  '@api/collections/organization-settings/dto/update-organization-setting.dto',
  () => ({
    UpdateOrganizationSettingDto: class UpdateOrganizationSettingDto {},
  }),
);

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsSettingsController } from '@api/collections/organizations/controllers/organizations-settings.controller';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { ConfigService } from '@api/config/config.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ByokService } from '@api/services/byok/byok.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import type { Request } from 'express';

describe('OrganizationsSettingsController', () => {
  let controller: OrganizationsSettingsController;
  let organizationSettingsService: OrganizationSettingsService;
  let subscriptionsService: SubscriptionsService;
  let mockReq: Request;

  const mockOrganizationSettings = {
    _id: '507f1f77bcf86cd799439011',
    branding: {
      colors: {
        primary: '#000000',
        secondary: '#ffffff',
      },
      logo: 'https://example.com/logo.png',
    },
    createdAt: new Date(),
    features: {
      apiAccess: true,
      customDomain: false,
    },
    organization: '507f1f77bcf86cd799439012',
    updatedAt: new Date(),
  };

  const mockSubscription = {
    _id: '507f1f77bcf86cd799439015',
    createdAt: new Date(),
    organization: '507f1f77bcf86cd799439012',
    plan: 'pro',
    status: 'active',
    updatedAt: new Date(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockOrganizationSettingsService = {
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  const mockIngredientsService = {
    findAvatarImageById: vi.fn(),
  };

  const mockSubscriptionsService = {
    findOne: vi.fn(),
  };

  const mockByokService = {
    getStatus: vi.fn().mockResolvedValue([]),
    removeKey: vi.fn().mockResolvedValue(undefined),
    saveKey: vi.fn().mockResolvedValue(undefined),
    validateKey: vi.fn().mockResolvedValue({ isValid: true }),
  };

  const mockFleetService = {
    isAvailable: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn().mockReturnValue('http://localhost:8080'),
  };

  beforeEach(async () => {
    mockReq = {} as Request;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsSettingsController],
      providers: [
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: OrganizationSettingsService,
          useValue: mockOrganizationSettingsService,
        },
        {
          provide: BrandsService,
          useValue: mockBrandsService,
        },
        {
          provide: IngredientsService,
          useValue: mockIngredientsService,
        },
        {
          provide: SubscriptionsService,
          useValue: mockSubscriptionsService,
        },
        {
          provide: ByokService,
          useValue: mockByokService,
        },
        {
          provide: FleetService,
          useValue: mockFleetService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrganizationsSettingsController>(
      OrganizationsSettingsController,
    );
    organizationSettingsService = module.get<OrganizationSettingsService>(
      OrganizationSettingsService,
    );
    subscriptionsService =
      module.get<SubscriptionsService>(SubscriptionsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSettings', () => {
    const organizationId = '507f1f77bcf86cd799439012';

    it('should return organization settings', async () => {
      mockOrganizationSettingsService.findOne.mockResolvedValue(
        mockOrganizationSettings,
      );

      const result = await controller.getSettings(mockReq, organizationId);

      expect(organizationSettingsService.findOne).toHaveBeenCalledWith({
        organization: organizationId,
      });
      expect(result).toBeDefined();
    });

    it('prefers the repaired request context organization id when the path is stale', async () => {
      mockOrganizationSettingsService.findOne.mockResolvedValue(
        mockOrganizationSettings,
      );

      const result = await controller.getSettings(
        {
          context: {
            organizationId: 'org_current',
          },
        } as Request,
        'org_legacy',
      );

      expect(organizationSettingsService.findOne).toHaveBeenCalledWith({
        organization: 'org_current',
      });
      expect(result).toBeDefined();
    });

    it('should return not found when settings do not exist', async () => {
      mockOrganizationSettingsService.findOne.mockResolvedValue(null);

      const result = await controller.getSettings(mockReq, organizationId);

      expect(result).toHaveProperty('statusCode', 404);
    });
  });

  describe('updateSettings', () => {
    const organizationId = '507f1f77bcf86cd799439012';
    const updateDto = {
      branding: {
        logo: 'https://example.com/new-logo.png',
      },
    };

    it('should update settings when settings exist', async () => {
      mockOrganizationSettingsService.findOne.mockResolvedValue(
        mockOrganizationSettings,
      );
      mockOrganizationSettingsService.patch.mockResolvedValue({
        ...mockOrganizationSettings,
        ...updateDto,
      });

      const result = await controller.updateSettings(
        mockReq,
        organizationId,
        updateDto,
      );

      expect(organizationSettingsService.findOne).toHaveBeenCalled();
      expect(organizationSettingsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return not found when settings do not exist', async () => {
      mockOrganizationSettingsService.findOne.mockResolvedValue(null);

      const result = await controller.updateSettings(
        mockReq,
        organizationId,
        updateDto,
      );

      expect(result).toHaveProperty('statusCode', 404);
    });

    it('should reject invalid avatar ingredient defaults', async () => {
      mockOrganizationSettingsService.findOne.mockResolvedValue(
        mockOrganizationSettings,
      );
      mockIngredientsService.findAvatarImageById.mockResolvedValue(null);

      await expect(
        controller.updateSettings(mockReq, organizationId, {
          defaultAvatarIngredientId: 'invalid-avatar-id',
        }),
      ).rejects.toThrow(
        'Default avatar must reference an avatar image ingredient in this organization',
      );
    });
  });

  describe('findOneSubscription', () => {
    const organizationId = '507f1f77bcf86cd799439012';

    it('should return organization subscription', async () => {
      mockSubscriptionsService.findOne.mockResolvedValue(mockSubscription);

      const result = await controller.findOneSubscription(
        mockReq,
        organizationId,
      );

      expect(subscriptionsService.findOne).toHaveBeenCalledWith({
        organization: organizationId,
      });
      expect(result).toBeDefined();
    });
  });

  describe('getDarkroomCapabilities', () => {
    const organizationId = '507f1f77bcf86cd799439012';
    const brandId = '507f1f77bcf86cd799439013';

    it('should return brand flag and fleet availability', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        _id: brandId,
        isDarkroomEnabled: true,
      });
      mockFleetService.isAvailable
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { ok: true },
      });

      const result = await controller.getDarkroomCapabilities(
        mockReq,
        organizationId,
        brandId,
      );

      expect(mockBrandsService.findOne).toHaveBeenCalledWith(
        {
          _id: brandId,
          isDeleted: false,
          organization: organizationId,
        },
        'none',
      );
      expect(mockFleetService.isAvailable).toHaveBeenNthCalledWith(1, 'images');
      expect(mockFleetService.isAvailable).toHaveBeenNthCalledWith(2, 'videos');
      expect(mockFleetService.isAvailable).toHaveBeenNthCalledWith(3, 'voices');
      expect(result).toMatchObject({
        _id: `darkroom-capabilities:${organizationId}:${brandId}`,
        brandEnabled: true,
        brandId,
        fleet: {
          images: true,
          llm: true,
          videos: false,
          voices: true,
        },
        organizationId,
      });
    });

    it('uses the repaired request context organization id for brand lookups', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        _id: brandId,
        isDarkroomEnabled: false,
      });
      mockFleetService.isAvailable.mockResolvedValue(false);
      (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('offline'),
      );

      await controller.getDarkroomCapabilities(
        {
          context: {
            organizationId: 'org_current',
          },
        } as Request,
        'org_legacy',
        brandId,
      );

      expect(mockBrandsService.findOne).toHaveBeenCalledWith(
        {
          _id: brandId,
          isDeleted: false,
          organization: 'org_current',
        },
        'none',
      );
    });
  });
});
