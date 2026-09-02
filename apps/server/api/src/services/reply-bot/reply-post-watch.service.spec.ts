import { REPLY_INGESTION_ACTION_IDS } from '@api/services/reply-bot/reply-ingestion-workflow-definition';
import { ReplyPostWatchService } from '@api/services/reply-bot/reply-post-watch.service';
import { Platform } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ReplyPostWatchService workflow boundary', () => {
  const workflowRunner = {
    registerAction: vi.fn(),
    registerWorkflow: vi.fn(),
    runWorkflow: vi.fn(),
  };
  const workflowQueue = { queueSystemWorkflow: vi.fn() };
  let service: ReplyPostWatchService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReplyPostWatchService(
      {} as never,
      {} as never,
      workflowRunner as never,
      workflowQueue as never,
    );
  });

  it('registers the post-watch graph and actions', () => {
    service.onModuleInit();

    expect(workflowRunner.registerWorkflow).toHaveBeenCalledOnce();
    expect(workflowRunner.registerAction).toHaveBeenCalledWith(
      REPLY_INGESTION_ACTION_IDS.FETCH_POST_WATCH,
      expect.any(Function),
    );
    expect(workflowRunner.registerAction).toHaveBeenCalledWith(
      REPLY_INGESTION_ACTION_IDS.FINALIZE_POST_WATCH,
      expect.any(Function),
    );
  });

  it('schedules the full post-watch series as workflow executions', async () => {
    workflowQueue.queueSystemWorkflow.mockResolvedValue('job');

    await expect(
      service.schedulePostWatch({
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: Platform.YOUTUBE,
        postId: 'video-1',
      }),
    ).resolves.toEqual({ scheduled: 7 });

    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledTimes(7);
    expect(workflowQueue.queueSystemWorkflow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        inputValues: {
          request: expect.objectContaining({
            attempt: 0,
            platform: Platform.YOUTUBE,
            postId: 'video-1',
          }),
        },
        organizationId: 'org-1',
        source: 'reply-post-watch-series',
      }),
      // The job id carries the watch identity so a redelivered series replaces
      // its own attempt instead of queueing a duplicate watch.
      expect.stringContaining('reply-post-watch-org-1-youtube-video-1-0'),
      expect.objectContaining({ delayMs: 120_000, replaceTerminalJob: true }),
    );
  });
});
