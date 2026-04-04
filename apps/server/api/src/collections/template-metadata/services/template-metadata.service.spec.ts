import { TemplateMetadata } from '@api/collections/template-metadata/schemas/template-metadata.schema';
import { TemplateMetadataService } from '@api/collections/template-metadata/services/template-metadata.service';
import { Template } from '@api/collections/templates/schemas/template.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { mockModel } from '@api/helpers/mocks/model.mock';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('TemplateMetadataService', () => {
  let service: TemplateMetadataService;
  let module: TestingModule;
  let metadataModel: ReturnType<typeof createMockModel>;
  let templateModel: ReturnType<typeof createMockModel>;

  const mockTemplateMetadata = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
    author: 'Test Author',
    averageQuality: 8.5,
    compatiblePlatforms: ['youtube', 'tiktok'],
    difficulty: 'medium',
    estimatedTime: 30,
    goals: ['engagement', 'reach'],
    isDeleted: false,
    lastUsed: new Date(),
    license: 'MIT',
    requiredFeatures: ['video'],
    save: vi.fn().mockResolvedValue(undefined),
    successRate: 85,
    template: new Types.ObjectId('507f1f77bcf86cd799439015'),
    toObject: vi.fn().mockReturnThis(),
    usageCount: 100,
    version: '1.0.0',
  };

  const mockTemplate = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439015'),
    key: 'test-template',
    label: 'Test Template',
  };

  const mockMetadataModel = {
    ...mockModel,
    create: vi.fn(),
    findOne: vi.fn().mockResolvedValue(mockTemplateMetadata),
    findOneAndUpdate: vi.fn().mockResolvedValue(mockTemplateMetadata),
    updateOne: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({}) }),
  };

  const mockTemplateModelInstance = {
    ...mockModel,
    findOne: vi.fn().mockResolvedValue(mockTemplate),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        TemplateMetadataService,
        {
          provide: getModelToken(TemplateMetadata.name, DB_CONNECTIONS.CLOUD),
          useValue: mockMetadataModel,
        },
        {
          provide: getModelToken(Template.name, DB_CONNECTIONS.CLOUD),
          useValue: mockTemplateModelInstance,
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
      ],
    }).compile();

    service = module.get<TemplateMetadataService>(TemplateMetadataService);
    metadataModel = module.get(
      getModelToken(TemplateMetadata.name, DB_CONNECTIONS.CLOUD),
    );
    templateModel = module.get(
      getModelToken(Template.name, DB_CONNECTIONS.CLOUD),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should have create method', () => {
      expect(service.create).toBeDefined();
      expect(typeof service.create).toBe('function');
    });

    // Note: Testing create() method requires mocking Mongoose Model constructor
    // which is complex. Integration tests would be better suited for this.
  });

  describe('update', () => {
    it('should update metadata', async () => {
      const templateId = '507f1f77bcf86cd799439015';
      const updates = {
        difficulty: 'hard',
        estimatedTime: 45,
      };

      const result = await service.update(templateId, updates);

      expect(metadataModel.findOneAndUpdate).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when metadata not found', async () => {
      mockMetadataModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.update('507f1f77bcf86cd799439015', { estimatedTime: 45 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateByTemplateKey', () => {
    it('should update metadata by template key', async () => {
      const key = 'test-template';
      const updates = {
        averageQuality: 9.0,
        incrementUsage: true,
        successRate: 90,
      };

      await service.updateByTemplateKey(key, updates);

      expect(templateModel.findOne).toHaveBeenCalledWith({
        isDeleted: false,
        key,
        purpose: 'prompt',
      });
    });

    it('should handle template not found', async () => {
      mockTemplateModelInstance.findOne.mockResolvedValue(null);

      await expect(
        service.updateByTemplateKey('invalid-key', { incrementUsage: true }),
      ).resolves.not.toThrow();
    });
  });
});
