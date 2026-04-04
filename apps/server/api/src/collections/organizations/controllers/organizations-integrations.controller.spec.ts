vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
import { CreateIntegrationDto } from '@api/endpoints/integrations/dto/create-integration.dto';
import { UpdateIntegrationDto } from '@api/endpoints/integrations/dto/update-integration.dto';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { IntegrationPlatform, IntegrationStatus } from '@genfeedai/enums';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('OrganizationsIntegrationsController', () => {
  let controller: OrganizationsIntegrationsController;
  let integrationsService: IntegrationsService;
  let mockReq: Request;

  const organizationId = '507f1f77bcf86cd799439012';
  const integrationId = '507f1f77bcf86cd799439011';

  const mockIntegration = {
    _id: new Types.ObjectId(integrationId),
    config: {},
    createdAt: new Date(),
    encryptedToken: 'encrypted-token',
    isDeleted: false,
    organization: new Types.ObjectId(organizationId),
    platform: IntegrationPlatform.DISCORD,
    status: IntegrationStatus.ACTIVE,
    updatedAt: new Date(),
  };

  const mockIntegrationsService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(async () => {
    mockReq = {} as Request;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsIntegrationsController],
      providers: [
        {
          provide: IntegrationsService,
          useValue: mockIntegrationsService,
        },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrganizationsIntegrationsController>(
      OrganizationsIntegrationsController,
    );
    integrationsService = module.get<IntegrationsService>(IntegrationsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const createDto: CreateIntegrationDto = {
      botToken: 'bot-token-123',
      platform: IntegrationPlatform.DISCORD,
    };

    it('should create an integration and return serialized result', async () => {
      mockIntegrationsService.create.mockResolvedValue(mockIntegration);

      const result = await controller.create(
        mockReq,
        organizationId,
        createDto,
      );

      expect(integrationsService.create).toHaveBeenCalledWith(
        organizationId,
        createDto,
      );
      expect(result).toEqual(mockIntegration);
    });

    it('should pass the full DTO including config to the service', async () => {
      const dtoWithConfig: CreateIntegrationDto = {
        botToken: 'bot-token-123',
        config: { webhookMode: true },
        platform: IntegrationPlatform.DISCORD,
      };
      mockIntegrationsService.create.mockResolvedValue({
        ...mockIntegration,
        config: { webhookMode: true },
      });

      await controller.create(mockReq, organizationId, dtoWithConfig);

      expect(integrationsService.create).toHaveBeenCalledWith(
        organizationId,
        dtoWithConfig,
      );
    });

    it('should propagate errors from the service', async () => {
      mockIntegrationsService.create.mockRejectedValue(
        new Error('Platform already exists'),
      );

      await expect(
        controller.create(mockReq, organizationId, createDto),
      ).rejects.toThrow('Platform already exists');
    });
  });

  describe('findAll', () => {
    it('should return a collection of integrations', async () => {
      const integrations = [mockIntegration];
      mockIntegrationsService.findAll.mockResolvedValue(integrations);

      const result = await controller.findAll(mockReq, organizationId);

      expect(integrationsService.findAll).toHaveBeenCalledWith(organizationId);
      expect(result).toBeDefined();
    });

    it('should return an empty collection when no integrations exist', async () => {
      mockIntegrationsService.findAll.mockResolvedValue([]);

      const result = await controller.findAll(mockReq, organizationId);

      expect(integrationsService.findAll).toHaveBeenCalledWith(organizationId);
      expect(result).toBeDefined();
    });

    it('should pass correct organizationId to the service', async () => {
      const otherOrgId = '607f1f77bcf86cd799439099';
      mockIntegrationsService.findAll.mockResolvedValue([]);

      await controller.findAll(mockReq, otherOrgId);

      expect(integrationsService.findAll).toHaveBeenCalledWith(otherOrgId);
    });
  });

  describe('findOne', () => {
    it('should return a single integration', async () => {
      mockIntegrationsService.findOne.mockResolvedValue(mockIntegration);

      const result = await controller.findOne(
        mockReq,
        organizationId,
        integrationId,
      );

      expect(integrationsService.findOne).toHaveBeenCalledWith(
        organizationId,
        integrationId,
      );
      expect(result).toEqual(mockIntegration);
    });

    it('should propagate not found errors from the service', async () => {
      mockIntegrationsService.findOne.mockRejectedValue(
        new Error('Integration not found'),
      );

      await expect(
        controller.findOne(mockReq, organizationId, integrationId),
      ).rejects.toThrow('Integration not found');
    });
  });

  describe('update', () => {
    const updateDto: UpdateIntegrationDto = {
      status: IntegrationStatus.INACTIVE,
    };

    it('should update an integration and return serialized result', async () => {
      const updated = {
        ...mockIntegration,
        status: IntegrationStatus.INACTIVE,
      };
      mockIntegrationsService.update.mockResolvedValue(updated);

      const result = await controller.update(
        mockReq,
        organizationId,
        integrationId,
        updateDto,
      );

      expect(integrationsService.update).toHaveBeenCalledWith(
        organizationId,
        integrationId,
        updateDto,
      );
      expect(result).toEqual(updated);
    });

    it('should propagate errors from the service', async () => {
      mockIntegrationsService.update.mockRejectedValue(
        new Error('Integration not found'),
      );

      await expect(
        controller.update(mockReq, organizationId, integrationId, updateDto),
      ).rejects.toThrow('Integration not found');
    });
  });

  describe('remove', () => {
    it('should remove an integration and return void', async () => {
      mockIntegrationsService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(organizationId, integrationId);

      expect(integrationsService.remove).toHaveBeenCalledWith(
        organizationId,
        integrationId,
      );
      expect(result).toBeUndefined();
    });

    it('should propagate errors from the service', async () => {
      mockIntegrationsService.remove.mockRejectedValue(
        new Error('Integration not found'),
      );

      await expect(
        controller.remove(organizationId, integrationId),
      ).rejects.toThrow('Integration not found');
    });
  });
});
