import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MetaAdsBulkController } from '@api/services/integrations/meta-ads/controllers/meta-ads-bulk.controller';
import { AdBulkUploadService } from '@api/services/integrations/meta-ads/services/ad-bulk-upload.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { AdBulkUploadJobsService } from '@server/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';

describe('MetaAdsBulkController workflow dispatch', () => {
  let controller: MetaAdsBulkController;
  let adBulkUploadService: { createBulkUpload: ReturnType<typeof vi.fn> };

  const organizationId = testId('org');
  const userId = testId('user');
  const credentialId = testId('credential');

  const mockUser = {
    organizationId,
    userId,
  } as unknown as User;

  const body = {
    adAccountId: 'act_123',
    adSetId: 'adset_1',
    bodyCopies: ['Body'],
    campaignId: 'camp_1',
    creativeSource: 'manual-upload',
    credentialId,
    headlines: ['Headline'],
    images: ['image-1'],
    linkUrl: 'https://example.com',
    videos: [],
  } as const;

  beforeEach(async () => {
    vi.clearAllMocks();

    adBulkUploadService = {
      createBulkUpload: vi.fn().mockResolvedValue({
        jobId: 'bulk-job-1',
        workflowJobId: 'workflow-job-1',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaAdsBulkController,
        { provide: AdBulkUploadJobsService, useValue: {} },
        { provide: AdBulkUploadService, useValue: adBulkUploadService },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(MetaAdsBulkController);
  });

  it('dispatches a credential reference to the workflow boundary', async () => {
    await expect(controller.createBulkUpload(mockUser, body)).resolves.toEqual({
      jobId: 'bulk-job-1',
      workflowJobId: 'workflow-job-1',
    });

    expect(adBulkUploadService.createBulkUpload).toHaveBeenCalledWith({
      adAccountId: 'act_123',
      adSetId: 'adset_1',
      bodyCopies: ['Body'],
      brandId: undefined,
      callToAction: undefined,
      campaignId: 'camp_1',
      creativeSource: 'manual-upload',
      credentialId,
      headlines: ['Headline'],
      images: ['image-1'],
      linkUrl: 'https://example.com',
      organizationId,
      userId,
      videos: [],
    });
    expect(
      adBulkUploadService.createBulkUpload.mock.calls[0]?.[0],
    ).not.toHaveProperty('accessToken');
  });
});
