import type { PostPublishJobData } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { PostPublishProcessor } from '@workers/processors/api/queues/post-publish/post-publish.processor';
import type { Job } from 'bullmq';

describe('PostPublishProcessor', () => {
  let processor: PostPublishProcessor;
  let cronPostsService: {
    processQueuedPost: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    cronPostsService = {
      processQueuedPost: vi.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        PostPublishProcessor,
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
          },
        },
        {
          provide: CronPostsService,
          useValue: cronPostsService,
        },
      ],
    }).compile();

    processor = module.get(PostPublishProcessor);
  });

  it('delegates queued jobs to CronPostsService', async () => {
    const data: PostPublishJobData = {
      enqueuedAt: '2026-07-09T17:26:45.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    };
    const job = {
      data,
      id: 'post-1',
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job<PostPublishJobData>;

    await processor.process(job);

    expect(cronPostsService.processQueuedPost).toHaveBeenCalledWith(data);
    expect(job.updateProgress).toHaveBeenCalledWith(10);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });
});
