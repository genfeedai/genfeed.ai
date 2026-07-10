import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import type { SocialInboxSyncJobData } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { SocialInboxSyncProcessor } from '@workers/processors/api/queues/social-inbox-sync/social-inbox-sync.processor';
import type { Job } from 'bullmq';
import { vi } from 'vitest';

describe('SocialInboxSyncProcessor', () => {
  let processor: SocialInboxSyncProcessor;
  let mockSocialInboxService: {
    ingestYoutubeComments: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockSocialInboxService = {
      ingestYoutubeComments: vi.fn().mockResolvedValue({
        conversationsCreated: 2,
        messagesCreated: 5,
      }),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        SocialInboxSyncProcessor,
        { provide: SocialInboxService, useValue: mockSocialInboxService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    processor = module.get(SocialInboxSyncProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('runs the ingestion with the job scope and options', async () => {
    const mockJob = {
      data: {
        brandId: 'brand-1',
        credentialId: 'credential-1',
        limit: 50,
        organizationId: 'org-1',
        userId: 'user-1',
      },
      updateProgress: vi.fn(),
    };

    const result = await processor.process(
      mockJob as unknown as Job<SocialInboxSyncJobData>,
    );

    expect(mockSocialInboxService.ingestYoutubeComments).toHaveBeenCalledWith(
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      { credentialId: 'credential-1', limit: 50 },
    );
    expect(result).toEqual({ conversationsCreated: 2, messagesCreated: 5 });
    expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
  });

  it('propagates ingestion failures so BullMQ can retry', async () => {
    mockSocialInboxService.ingestYoutubeComments.mockRejectedValueOnce(
      new Error('YouTube API unavailable'),
    );

    const mockJob = {
      data: { organizationId: 'org-1' },
      updateProgress: vi.fn(),
    };

    await expect(
      processor.process(mockJob as unknown as Job<SocialInboxSyncJobData>),
    ).rejects.toThrow('YouTube API unavailable');
  });
});
