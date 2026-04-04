vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  extractRequestContext: vi.fn(() => ({
    brandId: '507f1f77bcf86cd799439011',
    organizationId: '507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439013',
  })),
  getPublicMetadata: vi.fn(() => ({
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439013',
  })),
}));

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((v: string) => `decrypted_${v}`) },
}));

import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { MetaAdsBulkController } from '@api/services/integrations/meta-ads/controllers/meta-ads-bulk.controller';
import { AdBulkUploadService } from '@api/services/integrations/meta-ads/services/ad-bulk-upload.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('MetaAdsBulkController', () => {
  let controller: MetaAdsBulkController;
  let adBulkUploadService: Record<string, ReturnType<typeof vi.fn>>;
  let adBulkUploadJobsService: Record<string, ReturnType<typeof vi.fn>>;
  let credentialsService: Record<string, ReturnType<typeof vi.fn>>;

  const mockUser = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439013',
    },
  } as unknown as User;

  beforeEach(async () => {
    adBulkUploadService = {
      createBulkUpload: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
    };

    adBulkUploadJobsService = {
      findById: vi.fn(),
      findByOrganization: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn(),
    };

    credentialsService = {
      findOne: vi.fn().mockResolvedValue({ oauthToken: 'enc_tok' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaAdsBulkController,
        { provide: AdBulkUploadService, useValue: adBulkUploadService },
        {
          provide: AdBulkUploadJobsService,
          useValue: adBulkUploadJobsService,
        },
        { provide: CredentialsService, useValue: credentialsService },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    controller = module.get<MetaAdsBulkController>(MetaAdsBulkController);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createBulkUpload delegates to service with correct params', async () => {
    const body = {
      adAccountId: 'act_1',
      adSetId: 'adset_1',
      bodyCopies: ['Copy 1'],
      callToAction: 'LEARN_MORE',
      campaignId: 'camp_1',
      creativeSource: 'manual-upload' as const,
      credentialId: 'cred_1',
      headlines: ['Headline 1'],
      images: ['https://img.com/1.jpg'],
      linkUrl: 'https://example.com',
      videos: [],
    };

    const result = await controller.createBulkUpload(mockUser, body);
    expect(result).toEqual({ jobId: 'job-1' });
    expect(adBulkUploadService.createBulkUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'decrypted_enc_tok',
        adAccountId: 'act_1',
        organizationId: '507f1f77bcf86cd799439012',
      }),
    );
  });

  it('listJobs passes filters to service', async () => {
    await controller.listJobs(mockUser, 'pending' as never, '10', '0');
    expect(adBulkUploadJobsService.findByOrganization).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      { limit: 10, offset: 0, status: 'pending' },
    );
  });

  it('listJobs works without filters', async () => {
    await controller.listJobs(mockUser);
    expect(adBulkUploadJobsService.findByOrganization).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      { limit: undefined, offset: undefined, status: undefined },
    );
  });

  it('getJobStatus returns job when found', async () => {
    const job = { _id: 'job-1', status: 'completed' };
    adBulkUploadJobsService.findById.mockResolvedValue(job);
    const result = await controller.getJobStatus(mockUser, 'job-1');
    expect(result).toEqual(job);
  });

  it('getJobStatus throws NotFoundException when not found', async () => {
    adBulkUploadJobsService.findById.mockResolvedValue(null);
    await expect(
      controller.getJobStatus(mockUser, 'nonexistent'),
    ).rejects.toThrow(NotFoundException);
  });

  it('cancelJob updates status to cancelled', async () => {
    adBulkUploadJobsService.findById.mockResolvedValue({
      _id: 'job-1',
      status: 'pending',
    });
    const result = await controller.cancelJob(mockUser, 'job-1');
    expect(result).toEqual({ success: true });
    expect(adBulkUploadJobsService.updateStatus).toHaveBeenCalledWith(
      'job-1',
      'cancelled',
    );
  });

  it('cancelJob throws NotFoundException when job not found', async () => {
    adBulkUploadJobsService.findById.mockResolvedValue(null);
    await expect(controller.cancelJob(mockUser, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when no credential found', async () => {
    credentialsService.findOne.mockResolvedValue(null);
    await expect(
      controller.createBulkUpload(mockUser, {
        adAccountId: 'a',
        adSetId: 'a',
        bodyCopies: ['b'],
        campaignId: 'c',
        creativeSource: 'manual-upload' as const,
        credentialId: 'c',
        headlines: ['h'],
        images: ['i'],
        linkUrl: 'l',
        videos: [],
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
