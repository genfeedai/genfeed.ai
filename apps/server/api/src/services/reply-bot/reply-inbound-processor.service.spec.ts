import { ReplyInboundProcessorService } from '@api/services/reply-bot/reply-inbound-processor.service';
import { REPLY_INGESTION_ACTION_IDS } from '@api/services/reply-bot/reply-ingestion-workflow-definition';
import { Platform } from '@genfeedai/contracts';
import type { IReplyIntentClassification } from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const INBOUND_INPUT = {
  brandId: 'brand-1',
  commentAuthorUsername: 'viewer',
  commentId: 'comment-1',
  commentText: 'Great video',
  organizationId: 'org-1',
  parentPostId: 'video-1',
  parentPostPreview: 'How we ship weekly',
  platform: Platform.YOUTUBE as const,
  receivedAt: new Date().toISOString(),
  source: 'xaa' as const,
};

describe('ReplyInboundProcessorService workflow boundary', () => {
  const workflowRunner = {
    registerAction: vi.fn(),
    registerWorkflow: vi.fn(),
    runWorkflow: vi.fn(),
  };
  const workflowQueue = { queueSystemWorkflow: vi.fn() };
  const processedTweetsService = {
    isProcessed: vi.fn().mockResolvedValue(false),
    markAsProcessed: vi.fn(),
  };
  const authorReplyLoopService = {
    findResponderOwnerUserId: vi.fn().mockResolvedValue('user-1'),
  };
  const replyIntentClassifierService = { classify: vi.fn() };
  let service: ReplyInboundProcessorService;

  /** The prepare action as the workflow runner would invoke it. */
  async function prepareInbound(
    classification: IReplyIntentClassification,
  ): Promise<Record<string, unknown>> {
    replyIntentClassifierService.classify.mockResolvedValueOnce(classification);
    service.onModuleInit();
    const prepare = workflowRunner.registerAction.mock.calls.find(
      ([actionId]) => actionId === REPLY_INGESTION_ACTION_IDS.PREPARE_INBOUND,
    )?.[1] as (request: {
      input: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;

    return prepare({ input: { request: INBOUND_INPUT } });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    processedTweetsService.isProcessed.mockResolvedValue(false);
    authorReplyLoopService.findResponderOwnerUserId.mockResolvedValue('user-1');
    service = new ReplyInboundProcessorService(
      processedTweetsService as never,
      authorReplyLoopService as never,
      workflowRunner as never,
      workflowQueue as never,
      replyIntentClassifierService as never,
    );
  });

  describe('confidence gate', () => {
    it('auto-replies on a confident non-skip intent', async () => {
      const preparation = await prepareInbound({
        confidence: 0.95,
        intent: 'question',
        isAutoSkip: false,
        isNeedsReview: false,
        source: 'decision',
      });

      expect(preparation.items).toEqual([
        expect.objectContaining({
          intent: 'question',
          intentConfidence: 0.95,
          // Carried through so the send workflow neither re-decides nor
          // records the answer as an operator override.
          intentSource: 'decision',
        }),
      ]);
      expect(processedTweetsService.markAsProcessed).not.toHaveBeenCalled();
    });

    it('auto-skips and closes out a confident spam intent', async () => {
      const preparation = await prepareInbound({
        confidence: 0.97,
        intent: 'spam',
        isAutoSkip: true,
        isNeedsReview: false,
        source: 'decision',
      });

      expect(preparation.items).toEqual([]);
      expect(preparation.outcome).toMatchObject({
        skipped: true,
        success: true,
      });
      expect(processedTweetsService.markAsProcessed).toHaveBeenCalledOnce();
    });

    it('queues an uncertain comment for a person instead of guessing', async () => {
      const preparation = await prepareInbound({
        confidence: 0.4,
        intent: 'spam',
        isAutoSkip: false,
        isNeedsReview: true,
        source: 'regex',
      });

      expect(preparation.items).toEqual([]);
      expect(preparation.outcome).toMatchObject({
        skipped: true,
        success: true,
      });
      // Marking it processed would drop it out of the author inbox, which is
      // exactly where the person is meant to find it.
      expect(processedTweetsService.markAsProcessed).not.toHaveBeenCalled();
    });
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
    workflowQueue.queueSystemWorkflow.mockResolvedValueOnce('job-1');
    const input = INBOUND_INPUT;

    await expect(service.enqueue(input)).resolves.toEqual({ jobId: 'job-1' });
    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ inputValues: { request: input } }),
      'reply-inbound-org-1-comment-1',
      { replaceTerminalJob: true },
    );
  });
});
