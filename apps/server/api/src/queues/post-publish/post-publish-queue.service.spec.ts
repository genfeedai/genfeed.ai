import { ActionOrigin } from '@genfeedai/enums';
import {
  POST_PUBLISH_JOB_NAME,
  POST_PUBLISH_QUEUE,
} from '@genfeedai/queue-contracts';
import {
  PostPublishQueueService,
  runWithActionOrigin,
  SERVER_TOKENS,
} from '@genfeedai/server';
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
          provide: SERVER_TOKENS.logger,
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

  it('carries an immutable version-pin identifier to the worker', async () => {
    await service.enqueue({
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
      versionPinId: 'pin-1',
    });

    expect(queue.add).toHaveBeenCalledWith(
      POST_PUBLISH_JOB_NAME,
      expect.objectContaining({
        organizationId: 'org-1',
        postId: 'post-1',
        versionPinId: 'pin-1',
      }),
      expect.objectContaining({ jobId: 'post-1' }),
    );
  });

  it('uses the approval operation identity for duplicate prevention', async () => {
    queue.add.mockResolvedValue({ id: 'operation-1' });

    await service.enqueue({
      approvalId: 'approval-1',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'publish_now',
      versionPinId: 'pin-1',
    });

    expect(queue.getJob).toHaveBeenCalledWith('operation-1');
    expect(queue.add).toHaveBeenCalledWith(
      POST_PUBLISH_JOB_NAME,
      expect.objectContaining({
        approvalId: 'approval-1',
        operationId: 'operation-1',
      }),
      expect.objectContaining({ jobId: 'operation-1' }),
    );
  });

  it('propagates the trusted initiating action across queue retries', async () => {
    await runWithActionOrigin(
      {
        actorUserId: 'user-1',
        apiKeyId: 'key-1',
        origin: ActionOrigin.MCP,
      },
      () =>
        service.enqueue({
          organizationId: 'org-1',
          postId: 'post-1',
          source: 'publish_now',
        }),
    );

    expect(queue.add).toHaveBeenCalledWith(
      POST_PUBLISH_JOB_NAME,
      expect.objectContaining({
        actionContext: {
          actorUserId: 'user-1',
          apiKeyId: 'key-1',
          origin: ActionOrigin.MCP,
        },
      }),
      expect.anything(),
    );
  });

  it('marks scheduled sweeps as workflow-originated', async () => {
    await service.enqueue({
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    });

    expect(queue.add).toHaveBeenCalledWith(
      POST_PUBLISH_JOB_NAME,
      expect.objectContaining({
        actionContext: { origin: ActionOrigin.WORKFLOW },
      }),
      expect.anything(),
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
