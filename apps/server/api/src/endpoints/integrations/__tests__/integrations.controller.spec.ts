import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
import { CreateIntegrationDto } from '@api/endpoints/integrations/dto/create-integration.dto';
import { UpdateIntegrationDto } from '@api/endpoints/integrations/dto/update-integration.dto';
import { InternalIntegrationsController } from '@api/endpoints/integrations/integrations.controller';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { OrgIntegration } from '@api/endpoints/integrations/schemas/org-integration.schema';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { IntegrationPlatform, IntegrationStatus } from '@genfeedai/enums';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_, __, { docs }) => docs),
  serializeSingle: vi.fn((_, __, data) => data),
}));

const mockIntegration: OrgIntegration = {
  _id: '507f1f77bcf86cd799439011' as unknown as Types.ObjectId,
  config: {
    allowedUserIds: ['123', '456'],
    defaultWorkflow: 'wf-1',
  },
  createdAt: new Date('2024-01-01'),
  encryptedToken: 'encrypted-token',
  isDeleted: false,
  organization: '507f1f77bcf86cd799439012' as unknown as Types.ObjectId,
  platform: IntegrationPlatform.TELEGRAM,
  status: IntegrationStatus.ACTIVE,
  updatedAt: new Date('2024-01-01'),
} as OrgIntegration;

describe('OrganizationsIntegrationsController', () => {
  let controller: OrganizationsIntegrationsController;
  let service: vi.Mocked<IntegrationsService>;

  const mockReq = {} as Request;

  beforeEach(async () => {
    const mockService = {
      create: vi.fn(),
      findAll: vi.fn(),
      findByPlatform: vi.fn(),
      findOne: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsIntegrationsController],
      providers: [
        {
          provide: IntegrationsService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrganizationsIntegrationsController>(
      OrganizationsIntegrationsController,
    );
    service = module.get(IntegrationsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    const createDto: CreateIntegrationDto = {
      botToken: 'raw-bot-token',
      config: {
        allowedUserIds: ['123', '456'],
        defaultWorkflow: 'wf-1',
      },
      platform: IntegrationPlatform.TELEGRAM,
    };

    it('should create a new integration', async () => {
      service.create.mockResolvedValue(mockIntegration);

      const result = await controller.create(mockReq, 'org-123', createDto);

      expect(service.create).toHaveBeenCalledWith('org-123', createDto);
      expect(result).toEqual(mockIntegration);
    });

    it('should handle creation errors', async () => {
      const error = new BadRequestException('Integration already exists');
      service.create.mockRejectedValue(error);

      await expect(
        controller.create(mockReq, 'org-123', createDto),
      ).rejects.toThrow('Integration already exists');
    });

    it('should validate orgId parameter', async () => {
      service.create.mockResolvedValue(mockIntegration);

      await controller.create(mockReq, 'org-456', createDto);

      expect(service.create).toHaveBeenCalledWith('org-456', createDto);
    });
  });

  describe('findAll', () => {
    it('should return all integrations for an organization', async () => {
      const integrations = [mockIntegration];
      service.findAll.mockResolvedValue(integrations);

      const result = await controller.findAll(mockReq, 'org-123');

      expect(service.findAll).toHaveBeenCalledWith('org-123');
      expect(result).toEqual(integrations);
    });

    it('should return empty array when no integrations exist', async () => {
      service.findAll.mockResolvedValue([]);

      const result = await controller.findAll(mockReq, 'org-123');

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a specific integration', async () => {
      service.findOne.mockResolvedValue(mockIntegration);

      const result = await controller.findOne(
        mockReq,
        'org-123',
        'integration-456',
      );

      expect(service.findOne).toHaveBeenCalledWith(
        'org-123',
        'integration-456',
      );
      expect(result).toEqual(mockIntegration);
    });

    it('should handle not found errors', async () => {
      const error = new NotFoundException('Integration not found');
      service.findOne.mockRejectedValue(error);

      await expect(
        controller.findOne(mockReq, 'org-123', 'non-existent-id'),
      ).rejects.toThrow('Integration not found');
    });
  });

  describe('update', () => {
    const updateDto: UpdateIntegrationDto = {
      config: {
        defaultWorkflow: 'new-workflow',
      },
      status: IntegrationStatus.INACTIVE,
    };

    it('should update an existing integration', async () => {
      const updatedIntegration = {
        ...mockIntegration,
        config: { ...mockIntegration.config, defaultWorkflow: 'new-workflow' },
        status: IntegrationStatus.INACTIVE,
      };

      service.update.mockResolvedValue(updatedIntegration);

      const result = await controller.update(
        mockReq,
        'org-123',
        'integration-456',
        updateDto,
      );

      expect(service.update).toHaveBeenCalledWith(
        'org-123',
        'integration-456',
        updateDto,
      );
      expect(result).toEqual(updatedIntegration);
    });

    it('should handle update errors', async () => {
      const error = new NotFoundException('Integration not found');
      service.update.mockRejectedValue(error);

      await expect(
        controller.update(mockReq, 'org-123', 'non-existent-id', updateDto),
      ).rejects.toThrow('Integration not found');
    });

    it('should allow partial updates', async () => {
      const partialDto: UpdateIntegrationDto = {
        status: IntegrationStatus.ERROR,
      };
      const updatedIntegration = {
        ...mockIntegration,
        status: IntegrationStatus.ERROR,
      };

      service.update.mockResolvedValue(updatedIntegration);

      const result = await controller.update(
        mockReq,
        'org-123',
        'integration-456',
        partialDto,
      );

      expect(service.update).toHaveBeenCalledWith(
        'org-123',
        'integration-456',
        partialDto,
      );
      expect(result.status).toBe(IntegrationStatus.ERROR);
    });
  });

  describe('remove', () => {
    it('should remove an integration', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('org-123', 'integration-456');

      expect(service.remove).toHaveBeenCalledWith('org-123', 'integration-456');
    });

    it('should handle removal errors', async () => {
      const error = new NotFoundException('Integration not found');
      service.remove.mockRejectedValue(error);

      await expect(
        controller.remove('org-123', 'non-existent-id'),
      ).rejects.toThrow('Integration not found');
    });
  });
});

describe('InternalIntegrationsController', () => {
  let controller: InternalIntegrationsController;
  let service: vi.Mocked<IntegrationsService>;

  const mockIntegrationWithToken: OrgIntegration = {
    ...mockIntegration,
    botToken: 'decrypted-token', // Internal endpoints return decrypted tokens
  } as OrgIntegration;

  beforeEach(async () => {
    const mockService = {
      findByPlatform: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalIntegrationsController],
      providers: [
        {
          provide: IntegrationsService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(AdminApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InternalIntegrationsController>(
      InternalIntegrationsController,
    );
    service = module.get(IntegrationsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getByPlatform', () => {
    it('should return integrations for telegram platform', async () => {
      const integrations = [mockIntegrationWithToken];
      service.findByPlatform.mockResolvedValue(integrations);

      const result = await controller.getByPlatform(
        IntegrationPlatform.TELEGRAM,
      );

      expect(service.findByPlatform).toHaveBeenCalledWith(
        IntegrationPlatform.TELEGRAM,
      );
      expect(result).toEqual(integrations);
      expect(result[0].botToken).toBe('decrypted-token');
    });

    it('should return integrations for slack platform', async () => {
      const slackIntegration = {
        ...mockIntegrationWithToken,
        platform: IntegrationPlatform.SLACK,
      };
      const integrations = [slackIntegration];
      service.findByPlatform.mockResolvedValue(integrations);

      const result = await controller.getByPlatform(IntegrationPlatform.SLACK);

      expect(service.findByPlatform).toHaveBeenCalledWith(
        IntegrationPlatform.SLACK,
      );
      expect(result).toEqual(integrations);
    });

    it('should return integrations for discord platform', async () => {
      const discordIntegration = {
        ...mockIntegrationWithToken,
        platform: IntegrationPlatform.DISCORD,
      };
      const integrations = [discordIntegration];
      service.findByPlatform.mockResolvedValue(integrations);

      const result = await controller.getByPlatform(
        IntegrationPlatform.DISCORD,
      );

      expect(service.findByPlatform).toHaveBeenCalledWith(
        IntegrationPlatform.DISCORD,
      );
      expect(result).toEqual(integrations);
    });

    it('should return empty array when no integrations exist for platform', async () => {
      service.findByPlatform.mockResolvedValue([]);

      const result = await controller.getByPlatform(
        IntegrationPlatform.TELEGRAM,
      );

      expect(result).toEqual([]);
    });

    it('should handle service errors', async () => {
      const error = new Error('Database error');
      service.findByPlatform.mockRejectedValue(error);

      await expect(
        controller.getByPlatform(IntegrationPlatform.TELEGRAM),
      ).rejects.toThrow('Database error');
    });
  });
});
