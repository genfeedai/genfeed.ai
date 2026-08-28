import { Platform } from '@genfeedai/enums';
import { ReplyInboundProcessorService } from '@server/services/reply-bot/reply-inbound-processor.service';
import { REPLY_INGESTION_ACTION_IDS } from '@server/services/reply-bot/reply-ingestion-workflow-definition';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ReplyInboundProcessorService workflow boundary', () => {
  const workflowRunner = {
    registerAction: vi.fn(),
    registerWorkflow: vi.fn(),
    runWorkflowDefinition: vi.fn(),
  };
  const workflowQueue = { queueSystemWorkflowDefinition: vi.fn() };
  let service: ReplyInboundProcessorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReplyInboundProcessorService(
      {} as never,
      {} as never,
      workflowRunner as never,
      workflowQueue as never,
    );
  });

  it('registers the inbound graph and its atomic actions', () => {
    service.onModuleInit();

    expect(workflowRunner.registerWorkflow).toHaveBeenCalledOnce();
    expect(workflowRunner.registerAction).toHaveBeenCalledWith(
      REPLY_INGESTION_ACTION_IDS.PREPARE_INBOUND,
      expect.any(Function),
    );
    expect(workflowRunner.registerAction).toHaveBeenCalledWith(
      REPLY_INGESTION_ACTION_IDS.FINALIZE_INBOUND,
      expect.any(Function),
    );
  });

  it('queues webhook intake as a deterministic system workflow', async () => {
    workflowQueue.queueSystemWorkflowDefinition.mockResolvedValueOnce('job-1');
    const input = {
      brandId: 'brand-1',
      commentAuthorUsername: 'viewer',
      commentId: 'comment-1',
      commentText: 'Great video',
      organizationId: 'org-1',
      parentPostId: 'video-1',
      platform: Platform.YOUTUBE,
      receivedAt: new Date().toISOString(),
      source: 'xaa' as const,
    };

    await expect(service.enqueue(input)).resolves.toEqual({ jobId: 'job-1' });
    expect(workflowQueue.queueSystemWorkflowDefinition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ inputValues: { request: input } }),
      'reply-inbound-org-1-comment-1',
      undefined,
      { replaceTerminalJob: true },
    );
  });
});
