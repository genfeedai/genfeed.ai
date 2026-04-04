import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { SkillReceipt } from '@api/skills-pro/schemas/skill-receipt.schema';
import { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

interface SkillRegistryEntry {
  slug: string;
  name: string;
  description: string;
  version: string;
  s3Key: string;
  category: string;
}

interface SkillRegistry {
  skills: SkillRegistryEntry[];
  bundlePrice: number;
  updatedAt: string;
}

describe('SkillDownloadService', () => {
  let service: SkillDownloadService;
  let skillRegistryService: vi.Mocked<SkillRegistryService>;
  let filesClientService: vi.Mocked<FilesClientService>;
  let skillReceiptModel: Record<string, ReturnType<typeof vi.fn>>;

  const mockSkills: SkillRegistryEntry[] = [
    {
      category: 'generation',
      description: 'Generate images with AI',
      name: 'Image Gen Pro',
      s3Key: 'skills/image-gen-pro-v1.zip',
      slug: 'image-gen-pro',
      version: '1.0.0',
    },
    {
      category: 'editing',
      description: 'Edit videos with AI',
      name: 'Video Editor',
      s3Key: 'skills/video-editor-v2.zip',
      slug: 'video-editor',
      version: '2.0.0',
    },
  ];

  const mockRegistry: SkillRegistry = {
    bundlePrice: 49,
    skills: mockSkills,
    updatedAt: '2026-01-15T00:00:00Z',
  };

  const mockReceipt = {
    _id: 'receipt-object-id',
    downloadCount: 3,
    email: 'user@example.com',
    isDeleted: false,
    lastDownloadedAt: null,
    productType: 'bundle',
    receiptId: 'receipt-123',
    status: 'completed',
  };

  beforeEach(async () => {
    skillReceiptModel = {
      findOne: vi.fn(),
      updateOne: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillDownloadService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn() },
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
          provide: SkillRegistryService,
          useValue: {
            getBundleStripePriceId: vi.fn(),
            getRegistry: vi.fn(),
            getSkillBySlug: vi.fn(),
          },
        },
        {
          provide: FilesClientService,
          useValue: {
            getPresignedDownloadUrl: vi.fn(),
          },
        },
        {
          provide: getModelToken(SkillReceipt.name, DB_CONNECTIONS.CLOUD),
          useValue: skillReceiptModel,
        },
      ],
    }).compile();

    service = module.get<SkillDownloadService>(SkillDownloadService);
    skillRegistryService = module.get(SkillRegistryService);
    filesClientService = module.get(FilesClientService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyReceipt', () => {
    it('should return valid result with all skill slugs when receipt is found', async () => {
      skillReceiptModel.findOne.mockResolvedValue(mockReceipt);
      skillRegistryService.getRegistry.mockResolvedValue(mockRegistry);

      const result = await service.verifyReceipt('receipt-123');

      expect(result).toEqual({
        email: 'user@example.com',
        productType: 'bundle',
        skills: ['image-gen-pro', 'video-editor'],
        valid: true,
      });
      expect(skillReceiptModel.findOne).toHaveBeenCalledWith({
        isDeleted: false,
        receiptId: 'receipt-123',
        status: 'completed',
      });
    });

    it('should return invalid result when receipt is not found', async () => {
      skillReceiptModel.findOne.mockResolvedValue(null);

      const result = await service.verifyReceipt('nonexistent-receipt');

      expect(result).toEqual({
        email: '',
        productType: '',
        skills: [],
        valid: false,
      });
    });

    it('should return empty skills array when registry has no skills', async () => {
      skillReceiptModel.findOne.mockResolvedValue(mockReceipt);
      skillRegistryService.getRegistry.mockResolvedValue({
        bundlePrice: 0,
        skills: [],
        updatedAt: '2026-01-15T00:00:00Z',
      });

      const result = await service.verifyReceipt('receipt-123');

      expect(result.valid).toBe(true);
      expect(result.skills).toEqual([]);
    });
  });

  describe('getDownloadUrl', () => {
    it('should return download URL and skill info for valid receipt and slug', async () => {
      skillReceiptModel.findOne.mockResolvedValue(mockReceipt);
      skillReceiptModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      skillRegistryService.getRegistry.mockResolvedValue(mockRegistry);
      skillRegistryService.getSkillBySlug.mockReturnValue(mockSkills[0]);
      filesClientService.getPresignedDownloadUrl.mockResolvedValue(
        'https://cdn.example.com/download/image-gen-pro-v1.zip?token=abc',
      );

      const result = await service.getDownloadUrl(
        'receipt-123',
        'image-gen-pro',
      );

      expect(result).toEqual({
        downloadUrl:
          'https://cdn.example.com/download/image-gen-pro-v1.zip?token=abc',
        expiresIn: 900,
        skill: {
          name: 'Image Gen Pro',
          slug: 'image-gen-pro',
          version: '1.0.0',
        },
      });
      expect(filesClientService.getPresignedDownloadUrl).toHaveBeenCalledWith(
        'skills/image-gen-pro-v1.zip',
        'skills',
        900,
      );
    });

    it('should increment download count on successful download', async () => {
      skillReceiptModel.findOne.mockResolvedValue(mockReceipt);
      skillReceiptModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      skillRegistryService.getRegistry.mockResolvedValue(mockRegistry);
      skillRegistryService.getSkillBySlug.mockReturnValue(mockSkills[0]);
      filesClientService.getPresignedDownloadUrl.mockResolvedValue(
        'https://cdn.example.com/download.zip',
      );

      await service.getDownloadUrl('receipt-123', 'image-gen-pro');

      expect(skillReceiptModel.updateOne).toHaveBeenCalledWith(
        { _id: 'receipt-object-id' },
        {
          $inc: { downloadCount: 1 },
          $set: { lastDownloadedAt: expect.any(Date) },
        },
      );
    });

    it('should throw NotFoundException when receipt is not found', async () => {
      skillReceiptModel.findOne.mockResolvedValue(null);

      await expect(
        service.getDownloadUrl('nonexistent', 'image-gen-pro'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when skillSlug is not provided', async () => {
      skillReceiptModel.findOne.mockResolvedValue(mockReceipt);

      await expect(service.getDownloadUrl('receipt-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when skillSlug is undefined', async () => {
      skillReceiptModel.findOne.mockResolvedValue(mockReceipt);

      await expect(
        service.getDownloadUrl('receipt-123', undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when skill slug is not in registry', async () => {
      skillReceiptModel.findOne.mockResolvedValue(mockReceipt);
      skillRegistryService.getRegistry.mockResolvedValue(mockRegistry);
      skillRegistryService.getSkillBySlug.mockReturnValue(undefined);

      await expect(
        service.getDownloadUrl('receipt-123', 'nonexistent-skill'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate errors from filesClientService', async () => {
      skillReceiptModel.findOne.mockResolvedValue(mockReceipt);
      skillRegistryService.getRegistry.mockResolvedValue(mockRegistry);
      skillRegistryService.getSkillBySlug.mockReturnValue(mockSkills[0]);
      filesClientService.getPresignedDownloadUrl.mockRejectedValue(
        new Error('S3 presign failed'),
      );

      await expect(
        service.getDownloadUrl('receipt-123', 'image-gen-pro'),
      ).rejects.toThrow('S3 presign failed');
    });

    it('should work correctly with the second skill in registry', async () => {
      skillReceiptModel.findOne.mockResolvedValue(mockReceipt);
      skillReceiptModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      skillRegistryService.getRegistry.mockResolvedValue(mockRegistry);
      skillRegistryService.getSkillBySlug.mockReturnValue(mockSkills[1]);
      filesClientService.getPresignedDownloadUrl.mockResolvedValue(
        'https://cdn.example.com/download/video-editor-v2.zip',
      );

      const result = await service.getDownloadUrl(
        'receipt-123',
        'video-editor',
      );

      expect(result.skill).toEqual({
        name: 'Video Editor',
        slug: 'video-editor',
        version: '2.0.0',
      });
      expect(filesClientService.getPresignedDownloadUrl).toHaveBeenCalledWith(
        'skills/video-editor-v2.zip',
        'skills',
        900,
      );
    });
  });
});
