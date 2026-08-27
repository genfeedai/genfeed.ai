import { SocialInboxService } from '@server/collections/social-inbox/services/social-inbox.service';
import { Platform, SocialConversationType } from '@genfeedai/enums';
import type { SocialInboxSyncJobData } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { SocialInboxSyncProcessor } from '@workers/processors/api/queues/social-inbox-sync/social-inbox-sync.processor';
import type { Job } from 'bullmq';
import { vi } from 'vitest';

describe('SocialInboxSyncProcessor', () => {
  let processor: SocialInboxSyncProcessor;
  let mockSocialInboxService: {
    ingestInstagramComments: ReturnType<typeof vi.fn>;
    ingestInstagramDms: ReturnType<typeof vi.fn>;
    ingestLinkedInComments: ReturnType<typeof vi.fn>;
    ingestLinkedInDms: ReturnType<typeof vi.fn>;
    ingestXComments: ReturnType<typeof vi.fn>;
    ingestXDms: ReturnType<typeof vi.fn>;
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
      ingestInstagramComments: vi.fn().mockResolvedValue({
        conversationsCreated: 1,
        messagesCreated: 3,
      }),
      ingestInstagramDms: vi.fn().mockResolvedValue({
        conversationsCreated: 4,
        messagesCreated: 7,
      }),
      ingestLinkedInComments: vi.fn().mockResolvedValue({
        conversationsCreated: 6,
        messagesCreated: 9,
      }),
      ingestLinkedInDms: vi.fn().mockResolvedValue({
        conversationsCreated: 0,
        messagesCreated: 0,
      }),
      ingestXComments: vi.fn().mockResolvedValue({
        conversationsCreated: 3,
        messagesCreated: 8,
      }),
      ingestXDms: vi.fn().mockResolvedValue({
        conversationsCreated: 2,
        messagesCreated: 4,
      }),
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

  it('falls back to the YouTube comment sweep when the job carries no discriminator', async () => {
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

  it('routes an Instagram comment job to the Instagram comment sweep', async () => {
    const mockJob = {
      data: {
        conversationType: SocialConversationType.COMMENT,
        organizationId: 'org-1',
        platform: Platform.INSTAGRAM,
      },
      updateProgress: vi.fn(),
    };

    const result = await processor.process(
      mockJob as unknown as Job<SocialInboxSyncJobData>,
    );

    expect(mockSocialInboxService.ingestInstagramComments).toHaveBeenCalledWith(
      { brandId: undefined, organizationId: 'org-1', userId: undefined },
      { credentialId: undefined, limit: undefined },
    );
    expect(mockSocialInboxService.ingestYoutubeComments).not.toHaveBeenCalled();
    expect(result).toEqual({ conversationsCreated: 1, messagesCreated: 3 });
  });

  it('routes an Instagram DM job to the DM sweep', async () => {
    const mockJob = {
      data: {
        conversationType: SocialConversationType.DM,
        organizationId: 'org-1',
        platform: Platform.INSTAGRAM,
      },
      updateProgress: vi.fn(),
    };

    const result = await processor.process(
      mockJob as unknown as Job<SocialInboxSyncJobData>,
    );

    expect(mockSocialInboxService.ingestInstagramDms).toHaveBeenCalledTimes(1);
    expect(
      mockSocialInboxService.ingestInstagramComments,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({ conversationsCreated: 4, messagesCreated: 7 });
  });

  it('routes an X comment job to mentions and replies', async () => {
    const mockJob = {
      data: {
        conversationType: SocialConversationType.COMMENT,
        organizationId: 'org-1',
        platform: Platform.TWITTER,
      },
      updateProgress: vi.fn(),
    };

    const result = await processor.process(
      mockJob as unknown as Job<SocialInboxSyncJobData>,
    );

    expect(mockSocialInboxService.ingestXComments).toHaveBeenCalledTimes(1);
    expect(mockSocialInboxService.ingestYoutubeComments).not.toHaveBeenCalled();
    expect(result).toEqual({ conversationsCreated: 3, messagesCreated: 8 });
  });

  it('routes an X DM job to the X DM sweep', async () => {
    const mockJob = {
      data: {
        conversationType: SocialConversationType.DM,
        organizationId: 'org-1',
        platform: Platform.TWITTER,
      },
      updateProgress: vi.fn(),
    };

    await processor.process(mockJob as unknown as Job<SocialInboxSyncJobData>);

    expect(mockSocialInboxService.ingestXDms).toHaveBeenCalledTimes(1);
    expect(mockSocialInboxService.ingestXComments).not.toHaveBeenCalled();
  });

  it('routes LinkedIn comment and DM jobs to their sweeps', async () => {
    await processor.process({
      data: {
        conversationType: SocialConversationType.COMMENT,
        organizationId: 'org-1',
        platform: Platform.LINKEDIN,
      },
      updateProgress: vi.fn(),
    } as unknown as Job<SocialInboxSyncJobData>);
    await processor.process({
      data: {
        conversationType: SocialConversationType.DM,
        organizationId: 'org-1',
        platform: Platform.LINKEDIN,
      },
      updateProgress: vi.fn(),
    } as unknown as Job<SocialInboxSyncJobData>);

    expect(mockSocialInboxService.ingestLinkedInComments).toHaveBeenCalledTimes(
      1,
    );
    expect(mockSocialInboxService.ingestLinkedInDms).toHaveBeenCalledTimes(1);
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
