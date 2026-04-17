import { CreateIntegrationDto } from '@api/endpoints/integrations/dto/create-integration.dto';
import { UpdateIntegrationDto } from '@api/endpoints/integrations/dto/update-integration.dto';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IntegrationPlatform, IntegrationStatus } from '@genfeedai/enums';
import { REDIS_EVENTS } from '@genfeedai/integrations';
import type { OrgIntegration } from '@genfeedai/prisma';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

// Valid 24-char hex ObjectIds for use as orgId / integrationId params
const ORG_ID_1 = '507f1f77bcf86cd799439001';
const ORG_ID_2 = '507f1f77bcf86cd799439002';
const ORG_ID_3 = '507f1f77bcf86cd799439003';
const INTEGRATION_ID = '507f1f77bcf86cd799439456';

// Mock crypto service
const mockCryptoService = {
  decrypt: vi.fn(),
  encrypt: vi.fn(),
};

// Mock document factory
const createMockDocument = (data: Record<string, unknown>) => {
  const docId = new Types.ObjectId();
  const doc = {
    ...data,
    _id: docId,
    toObject: vi.fn(),
  };
  const savedDoc = {
    ...data,
    _id: docId,
    toObject: vi.fn().mockReturnValue(data),
  };
  doc.save = vi.fn().mockResolvedValue(savedDoc);
  doc.toObject = vi.fn().mockReturnValue(data);
  return doc;
};

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  let model: any;
  let eventEmitter: any;

  const mockIntegration = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    config: {
      allowedUserIds: ['123456', '789012'],
      defaultWorkflow: 'wf-image-gen',
    },
    createdAt: new Date('2024-01-01'),
    encryptedToken: 'encrypted-token-data',
    isDeleted: false,
    organization: new Types.ObjectId('507f1f77bcf86cd799439012'),
    platform: IntegrationPlatform.TELEGRAM,
    save: vi.fn(),
    status: IntegrationStatus.ACTIVE,
    toObject: vi.fn(),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    // MockModel must be a plain function constructor (not vi.fn()) for `new this.integrationModel()`
    function MockModel(data: Record<string, unknown>) {
      return createMockDocument(data);
    }
    MockModel.findOne = vi.fn();
    MockModel.find = vi.fn();
    MockModel.create = vi.fn();
    MockModel.exec = vi.fn();
    MockModel.save = vi.fn();

    const mockEventEmitter = {
      emit: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        {
          provide: PrismaService,
          useValue: MockModel,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: 'CryptoService',
          useValue: mockCryptoService,
        },
      ],
    }).compile();

    service = module.get<IntegrationsService>(IntegrationsService);
    model = module.get(PrismaService);
    eventEmitter = module.get(EventEmitter2);

    // Reset mocks
    mockCryptoService.encrypt.mockResolvedValue('encrypted-token-data');
    mockCryptoService.decrypt.mockReturnValue('decrypted-token');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    const createDto: CreateIntegrationDto = {
      botToken: 'raw-bot-token-123',
      config: {
        allowedUserIds: ['123456'],
        defaultWorkflow: 'wf-test',
      },
      platform: IntegrationPlatform.TELEGRAM,
    };

    it('should create a new integration successfully', async () => {
      // No existing integration
      model.findOne.mockResolvedValue(null);

      const _result = await service.create(ORG_ID_1, createDto);

      expect(mockCryptoService.encrypt).toHaveBeenCalledWith(
        'raw-bot-token-123',
      );
      expect(model.findOne).toHaveBeenCalledWith({
        isDeleted: false,
        organization: new Types.ObjectId(ORG_ID_1),
        platform: IntegrationPlatform.TELEGRAM,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_CREATED,
        {
          integrationId: expect.any(String),
          orgId: ORG_ID_1,
          platform: IntegrationPlatform.TELEGRAM,
        },
      );
    });

    it('should throw error when integration already exists', async () => {
      model.findOne.mockResolvedValue(
        mockIntegration as unknown as OrgIntegration,
      );

      await expect(service.create(ORG_ID_1, createDto)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockCryptoService.encrypt).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should handle different platforms', async () => {
      model.findOne.mockResolvedValue(null);

      const slackDto = { ...createDto, platform: 'slack' as const };
      await service.create(ORG_ID_2, slackDto);

      expect(model.findOne).toHaveBeenCalledWith({
        isDeleted: false,
        organization: new Types.ObjectId(ORG_ID_2),
        platform: 'slack',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_CREATED,
        {
          integrationId: expect.any(String),
          orgId: ORG_ID_2,
          platform: 'slack',
        },
      );
    });

    it('should handle create with minimal config', async () => {
      model.findOne.mockResolvedValue(null);

      const minimalDto = {
        botToken: 'discord-token',
        platform: 'discord' as const,
      };

      await service.create(ORG_ID_3, minimalDto);

      expect(mockCryptoService.encrypt).toHaveBeenCalledWith('discord-token');
    });
  });

  describe('findAll', () => {
    it('should return all integrations for an organization', async () => {
      const integrations = [mockIntegration];
      const mockQuery = {
        exec: vi.fn().mockResolvedValue(integrations),
      };
      model.find.mockReturnValue(
        mockQuery as unknown as ReturnType<typeof model.find>,
      );

      // Mock toObject for each integration
      integrations.forEach((integration: Record<string, unknown>) => {
        integration.toObject = vi.fn().mockReturnValue(integration);
      });

      const result = await service.findAll(ORG_ID_1);

      expect(model.find).toHaveBeenCalledWith({
        isDeleted: false,
        organization: new Types.ObjectId(ORG_ID_1),
      });

      expect(result).toHaveLength(1);
      expect(result[0].encryptedToken).toBe('***MASKED***');
    });

    it('should return empty array when no integrations exist', async () => {
      const mockQuery = {
        exec: vi.fn().mockResolvedValue([]),
      };
      model.find.mockReturnValue(
        mockQuery as unknown as ReturnType<typeof model.find>,
      );

      const result = await service.findAll(ORG_ID_1);

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a specific integration', async () => {
      const mockQuery = {
        exec: vi.fn().mockResolvedValue(mockIntegration),
      };
      model.findOne.mockReturnValue(
        mockQuery as unknown as ReturnType<typeof model.find>,
      );
      mockIntegration.toObject = vi.fn().mockReturnValue(mockIntegration);

      const result = await service.findOne(ORG_ID_1, INTEGRATION_ID);

      expect(model.findOne).toHaveBeenCalledWith({
        _id: new Types.ObjectId(INTEGRATION_ID),
        isDeleted: false,
        organization: new Types.ObjectId(ORG_ID_1),
      });

      expect(result.encryptedToken).toBe('***MASKED***');
    });

    it('should throw NotFoundException when integration not found', async () => {
      const mockQuery = {
        exec: vi.fn().mockResolvedValue(null),
      };
      model.findOne.mockReturnValue(
        mockQuery as unknown as ReturnType<typeof model.find>,
      );

      await expect(service.findOne(ORG_ID_1, INTEGRATION_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByPlatform', () => {
    it('should return integrations for a specific platform', async () => {
      const integrations = [mockIntegration];
      const mockQuery = {
        exec: vi.fn().mockResolvedValue(integrations),
      };
      model.find.mockReturnValue(
        mockQuery as unknown as ReturnType<typeof model.find>,
      );

      integrations.forEach((integration: Record<string, unknown>) => {
        integration.toObject = vi.fn().mockReturnValue(integration);
      });

      const result = await service.findByPlatform(IntegrationPlatform.TELEGRAM);

      expect(model.find).toHaveBeenCalledWith({
        isDeleted: false,
        platform: IntegrationPlatform.TELEGRAM,
        status: IntegrationStatus.ACTIVE,
      });

      expect(mockCryptoService.decrypt).toHaveBeenCalledWith(
        'encrypted-token-data',
      );
      expect(result[0].botToken).toBe('decrypted-token');
    });

    it('should handle different platforms', async () => {
      const mockQuery = {
        exec: vi.fn().mockResolvedValue([]),
      };
      model.find.mockReturnValue(
        mockQuery as unknown as ReturnType<typeof model.find>,
      );

      await service.findByPlatform('slack');

      expect(model.find).toHaveBeenCalledWith({
        isDeleted: false,
        platform: 'slack',
        status: IntegrationStatus.ACTIVE,
      });
    });
  });

  describe('update', () => {
    const updateDto: UpdateIntegrationDto = {
      config: { defaultWorkflow: 'new-workflow' },
      status: IntegrationStatus.INACTIVE,
    };

    beforeEach(() => {
      mockIntegration.save = vi.fn().mockResolvedValue(mockIntegration);
      mockIntegration.toObject = vi.fn().mockReturnValue(mockIntegration);
    });

    it('should update an existing integration', async () => {
      model.findOne.mockResolvedValue(
        mockIntegration as unknown as OrgIntegration,
      );

      const result = await service.update(ORG_ID_1, INTEGRATION_ID, updateDto);

      expect(model.findOne).toHaveBeenCalledWith({
        _id: new Types.ObjectId(INTEGRATION_ID),
        isDeleted: false,
        organization: new Types.ObjectId(ORG_ID_1),
      });

      expect(mockIntegration.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_UPDATED,
        {
          integrationId: mockIntegration._id.toString(),
          orgId: ORG_ID_1,
          platform: IntegrationPlatform.TELEGRAM,
        },
      );

      expect(result.encryptedToken).toBe('***MASKED***');
    });

    it('should update bot token when provided', async () => {
      const updateWithTokenDto = {
        ...updateDto,
        botToken: 'new-bot-token',
      };

      model.findOne.mockResolvedValue(
        mockIntegration as unknown as OrgIntegration,
      );

      await service.update(ORG_ID_1, INTEGRATION_ID, updateWithTokenDto);

      expect(mockCryptoService.encrypt).toHaveBeenCalledWith('new-bot-token');
    });

    it('should throw NotFoundException when integration not found', async () => {
      model.findOne.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID_1, INTEGRATION_ID, updateDto),
      ).rejects.toThrow(NotFoundException);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should merge config properly', async () => {
      const existingIntegration = {
        ...mockIntegration,
        config: {
          allowedUserIds: ['123'],
          defaultWorkflow: 'old-workflow',
          webhookMode: true,
        },
        save: vi.fn().mockResolvedValue({
          ...mockIntegration,
          toObject: vi.fn().mockReturnValue(mockIntegration),
        }),
        toObject: vi.fn().mockReturnValue(mockIntegration),
      };

      model.findOne.mockResolvedValue(
        existingIntegration as unknown as OrgIntegration,
      );

      const partialConfigUpdate = {
        config: { defaultWorkflow: 'new-workflow' },
      };

      await service.update(ORG_ID_1, INTEGRATION_ID, partialConfigUpdate);

      expect(existingIntegration.config).toEqual({
        allowedUserIds: ['123'],
        defaultWorkflow: 'new-workflow',
        webhookMode: true,
      });
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      mockIntegration.save = vi.fn().mockResolvedValue(mockIntegration);
    });

    it('should soft delete an integration', async () => {
      model.findOne.mockResolvedValue(
        mockIntegration as unknown as OrgIntegration,
      );

      await service.remove(ORG_ID_1, INTEGRATION_ID);

      expect(model.findOne).toHaveBeenCalledWith({
        _id: new Types.ObjectId(INTEGRATION_ID),
        isDeleted: false,
        organization: new Types.ObjectId(ORG_ID_1),
      });

      expect(mockIntegration.isDeleted).toBe(true);
      expect(mockIntegration.save).toHaveBeenCalled();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_DELETED,
        {
          integrationId: mockIntegration._id.toString(),
          orgId: ORG_ID_1,
          platform: IntegrationPlatform.TELEGRAM,
        },
      );
    });

    it('should throw NotFoundException when integration not found', async () => {
      model.findOne.mockResolvedValue(null);

      await expect(service.remove(ORG_ID_1, INTEGRATION_ID)).rejects.toThrow(
        NotFoundException,
      );

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('Redis event emission', () => {
    beforeEach(() => {
      model.findOne.mockResolvedValue(null);
    });

    it('should emit correct events for all platforms', async () => {
      const platforms = [
        IntegrationPlatform.TELEGRAM,
        IntegrationPlatform.SLACK,
        IntegrationPlatform.DISCORD,
      ] as const;

      for (const platform of platforms) {
        const createDto = {
          botToken: `${platform}-token`,
          platform,
        };

        await service.create(ORG_ID_1, createDto);

        expect(eventEmitter.emit).toHaveBeenCalledWith(
          REDIS_EVENTS.INTEGRATION_CREATED,
          {
            integrationId: expect.any(String),
            orgId: ORG_ID_1,
            platform,
          },
        );
      }
    });

    it('should emit events with correct data structure', async () => {
      const createDto = {
        botToken: 'test-token',
        platform: 'telegram' as const,
      };

      await service.create(ORG_ID_2, createDto);

      const emittedCall = eventEmitter.emit.mock.calls[0];
      expect(emittedCall[0]).toBe(REDIS_EVENTS.INTEGRATION_CREATED);

      const eventData = emittedCall[1];
      expect(eventData).toHaveProperty('orgId', ORG_ID_2);
      expect(eventData).toHaveProperty(
        'platform',
        IntegrationPlatform.TELEGRAM,
      );
      expect(eventData).toHaveProperty('integrationId');
      expect(typeof eventData.integrationId).toBe('string');
    });
  });
});
