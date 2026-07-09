import { PostPublishQueueService } from '@api/queues/post-publish/post-publish-queue.service';
import {
  POST_PUBLISH_JOB_NAME,
  POST_PUBLISH_QUEUE,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';

const makeJob = (state: string, id = 'post-1') => ({
  getState: vi.fn().mockResolvedValue(state),
  id,
  remove: vi.fn().mockResolvedValue(undefined),
});

describe('PostPublishQueueService', () => {
  let service: PostPublishQueueService;
  let queue: {
    add: ReturnType<typeof vi.fn>;
    getJob: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    queue = {
      add: vi.fn().mockResolvedValue({ id: 'post-1' }),
      getJob: vi.fn().mockResolvedValue(null),
    };

    const module = await Test.createTestingModule({
      providers: [
        PostPublishQueueService,
        {
          provide: getQueueToken(POST_PUBLISH_QUEUE),
          useValue: queue,
        },
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PostPublishQueueService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('queues one publish job with the post id as BullMQ jobId', async () => {
    await service.enqueue({
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(queue.add).toHaveBeenCalledWith(
      POST_PUBLISH_JOB_NAME,
      expect.objectContaining({
        organizationId: 'org-1',
        postId: 'post-1',
        source: 'scheduled_sweep',
      }),
      expect.objectContaining({
        attempts: 1,
        jobId: 'post-1',
      }),
    );
  });

  it('does not enqueue a duplicate active job', async () => {
    queue.getJob.mockResolvedValue(makeJob('active'));

    const jobId = await service.enqueue({
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'publish_now',
      userId: 'user-1',
    });

    expect(jobId).toBe('post-1');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('removes completed jobs so a later sweep can retry through durable state', async () => {
    const completed = makeJob('completed');
    queue.getJob.mockResolvedValue(completed);

    await service.enqueue({
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(completed.remove).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalled();
  });
});
