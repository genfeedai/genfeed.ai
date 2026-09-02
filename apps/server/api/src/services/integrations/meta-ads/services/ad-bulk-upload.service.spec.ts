import { AdBulkUploadWorkflowService } from '@api/collections/workflows/services/ad-bulk-upload-workflow.service';
import {
  AdBulkUploadService,
  type CreateBulkUploadInput,
} from '@api/services/integrations/meta-ads/services/ad-bulk-upload.service';
import { testId } from '@helpers/testing/test-id.helper';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('AdBulkUploadService', () => {
  let service: AdBulkUploadService;
  let workflow: { queue: ReturnType<typeof vi.fn> };

  const validInput: CreateBulkUploadInput = {
    adAccountId: 'act_1',
    adSetId: 'adset_1',
    bodyCopies: ['Body 1'],
    campaignId: 'camp_1',
    creativeSource: 'manual-upload',
    credentialId: testId('credential'),
    headlines: ['Headline 1'],
    images: ['https://img.com/1.jpg'],
    linkUrl: 'https://example.com',
    organizationId: testId('org'),
    userId: testId('user'),
    videos: [],
  };

  beforeEach(async () => {
    workflow = {
      queue: vi.fn().mockResolvedValue({
        jobId: 'bulk-job-1',
        workflowJobId: 'workflow-job-1',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdBulkUploadService,
        { provide: AdBulkUploadWorkflowService, useValue: workflow },
      ],
    }).compile();

    service = module.get(AdBulkUploadService);
  });

  afterEach(() => vi.clearAllMocks());

  it('queues the action-backed workflow without credential secrets', async () => {
    await expect(service.createBulkUpload(validInput)).resolves.toEqual({
      jobId: 'bulk-job-1',
      workflowJobId: 'workflow-job-1',
    });

    expect(workflow.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        adAccountId: 'act_1',
        credentialId: testId('credential'),
        jobId: expect.any(String),
        organizationId: testId('org'),
      }),
      testId('user'),
    );
    expect(workflow.queue.mock.calls[0]?.[0]).not.toHaveProperty('accessToken');
  });

  it.each([
    ['credentialId', ''],
    ['adAccountId', ''],
    ['campaignId', ''],
    ['adSetId', ''],
    ['linkUrl', ''],
  ] as const)('rejects a missing %s', async (field, value) => {
    await expect(
      service.createBulkUpload({ ...validInput, [field]: value }),
    ).rejects.toThrow(BadRequestException);
    expect(workflow.queue).not.toHaveBeenCalled();
  });

  it('rejects empty creative permutations', async () => {
    await expect(
      service.createBulkUpload({ ...validInput, headlines: [] }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createBulkUpload({ ...validInput, bodyCopies: [] }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createBulkUpload({ ...validInput, images: [], videos: [] }),
    ).rejects.toThrow(BadRequestException);
    expect(workflow.queue).not.toHaveBeenCalled();
  });

  it.each(['content-library', 'ai-generated'] as const)(
    'rejects %s until it has an explicit asset-resolution workflow',
    async (creativeSource) => {
      await expect(
        service.createBulkUpload({ ...validInput, creativeSource }),
      ).rejects.toThrow(BadRequestException);
      expect(workflow.queue).not.toHaveBeenCalled();
    },
  );
});
