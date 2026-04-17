import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { QueueService } from '@api/queues/core/queue.service';
import {
  AdBulkUploadService,
  CreateBulkUploadInput,
} from '@api/services/integrations/meta-ads/services/ad-bulk-upload.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('AdBulkUploadService', () => {
  let service: AdBulkUploadService;
  let bulkUploadJobsService: Record<string, ReturnType<typeof vi.fn>>;
  let queueService: Record<string, ReturnType<typeof vi.fn>>;

  const validInput: CreateBulkUploadInput = {
    accessToken: 'tok_123',
    adAccountId: 'act_1',
    adSetId: 'adset_1',
    bodyCopies: ['Body 1'],
    campaignId: 'camp_1',
    creativeSource: 'manual-upload' as const,
    credentialId: '507f1f77bcf86cd799439014',
    headlines: ['Headline 1'],
    images: ['https://img.com/1.jpg'],
    linkUrl: 'https://example.com',
    organizationId: '507f1f77bcf86cd799439012',
    videos: [],
  };

  beforeEach(async () => {
    const jobId = new Types.ObjectId();
    bulkUploadJobsService = {
      create: vi.fn().mockResolvedValue({ _id: jobId }),
    };

    queueService = {
      add: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdBulkUploadService,
        {
          provide: AdBulkUploadJobsService,
          useValue: bulkUploadJobsService,
        },
        { provide: QueueService, useValue: queueService },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdBulkUploadService>(AdBulkUploadService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a bulk upload job and queues it', async () => {
    const result = await service.createBulkUpload(validInput);
    expect(result).toHaveProperty('jobId');
    expect(bulkUploadJobsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        adAccountId: 'act_1',
        status: 'pending',
        totalPermutations: 1, // 1 image * 1 headline * 1 body
      }),
    );
    expect(queueService.add).toHaveBeenCalledWith(
      'ad-bulk-upload',
      expect.objectContaining({ accessToken: 'tok_123' }),
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('calculates correct permutations for multiple media and copy', async () => {
    const input: CreateBulkUploadInput = {
      ...validInput,
      bodyCopies: ['Body 1', 'Body 2'],
      headlines: ['H1', 'H2', 'H3'],
      images: ['img1', 'img2'],
      videos: ['vid1'],
    };
    await service.createBulkUpload(input);
    // (2 images + 1 video) * 3 headlines * 2 bodies = 18
    expect(bulkUploadJobsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ totalPermutations: 18 }),
    );
  });

  it('throws BadRequestException when credentialId is missing', async () => {
    await expect(
      service.createBulkUpload({ ...validInput, credentialId: '' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when adAccountId is missing', async () => {
    await expect(
      service.createBulkUpload({ ...validInput, adAccountId: '' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when campaignId is missing', async () => {
    await expect(
      service.createBulkUpload({ ...validInput, campaignId: '' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when adSetId is missing', async () => {
    await expect(
      service.createBulkUpload({ ...validInput, adSetId: '' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when linkUrl is missing', async () => {
    await expect(
      service.createBulkUpload({ ...validInput, linkUrl: '' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when headlines are empty', async () => {
    await expect(
      service.createBulkUpload({ ...validInput, headlines: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when bodyCopies are empty', async () => {
    await expect(
      service.createBulkUpload({ ...validInput, bodyCopies: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when no media items provided', async () => {
    await expect(
      service.createBulkUpload({ ...validInput, images: [], videos: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('handles content-library creativeSource', async () => {
    const input: CreateBulkUploadInput = {
      ...validInput,
      creativeSource: 'content-library' as const,
    };
    const result = await service.createBulkUpload(input);
    expect(result).toHaveProperty('jobId');
  });

  it('handles ai-generated creativeSource', async () => {
    const input: CreateBulkUploadInput = {
      ...validInput,
      creativeSource: 'ai-generated' as const,
    };
    const result = await service.createBulkUpload(input);
    expect(result).toHaveProperty('jobId');
  });

  it('includes brandId in job doc when provided', async () => {
    const input: CreateBulkUploadInput = {
      ...validInput,
      brandId: '507f1f77bcf86cd799439015',
    };
    await service.createBulkUpload(input);
    expect(bulkUploadJobsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: expect.any(Types.ObjectId),
      }),
    );
  });
});
