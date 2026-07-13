import type { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import type { AgentChatContext } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import type { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { Effect } from 'effect';

const context: AgentChatContext = {
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
};

const mockStreamPublisher = {
  publishDoneEffect: vi.fn(() => Effect.void),
  publishErrorEffect: vi.fn(() => Effect.void),
  publishInputRequestEffect: vi.fn(() => Effect.void),
  publishReasoningEffect: vi.fn(() => Effect.void),
  publishStreamStartEffect: vi.fn(() => Effect.void),
  publishTokenEffect: vi.fn(() => Effect.void),
  publishToolCompleteEffect: vi.fn(() => Effect.void),
  publishToolStartEffect: vi.fn(() => Effect.void),
  publishUIBlocksEffect: vi.fn(() => Effect.void),
  publishWorkEventEffect: vi.fn(() => Effect.void),
};

const mockAgentRunsService = {
  fail: vi.fn().mockResolvedValue({}),
};

describe('AgentStreamEffectsService', () => {
  let serviceWithRuns: AgentStreamEffectsService;
  let serviceWithoutRuns: AgentStreamEffectsService;

  beforeEach(() => {
    vi.clearAllMocks();
    serviceWithRuns = new AgentStreamEffectsService(
      mockStreamPublisher as unknown as AgentStreamPublisherService,
      mockAgentRunsService as unknown as AgentRunsService,
    );
    serviceWithoutRuns = new AgentStreamEffectsService(
      mockStreamPublisher as unknown as AgentStreamPublisherService,
      undefined,
    );
  });

  describe('publishStreamTokenEffect', () => {
    it('delegates to the stream publisher token effect', async () => {
      await runEffectPromise(
        serviceWithRuns.publishStreamTokenEffect({
          runId: 'run-1',
          threadId: 'thread-1',
          token: 'hello',
          userId: 'user-1',
        }),
      );

      expect(mockStreamPublisher.publishTokenEffect).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishTokenEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'run-1',
          threadId: 'thread-1',
          token: 'hello',
          userId: 'user-1',
        }),
      );
    });
  });

  describe('publishStreamDoneEffect', () => {
    it('delegates to the stream publisher done effect', async () => {
      await runEffectPromise(
        serviceWithRuns.publishStreamDoneEffect({
          creditsRemaining: 10,
          creditsUsed: 5,
          fullContent: 'done',
          metadata: {},
          runId: 'run-1',
          threadId: 'thread-1',
          toolCalls: [],
          userId: 'user-1',
        }),
      );

      expect(mockStreamPublisher.publishDoneEffect).toHaveBeenCalledOnce();
    });
  });

  describe('publishStreamLifecycleStartedEffect', () => {
    it('publishes a stream-start effect followed by a started work event', async () => {
      await runEffectPromise(
        serviceWithRuns.publishStreamLifecycleStartedEffect({
          context,
          model: 'gpt-5',
          startedAt: '2026-01-01T00:00:00.000Z',
          threadId: 'thread-1',
        }),
      );

      expect(
        mockStreamPublisher.publishStreamStartEffect,
      ).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishStreamStartEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5',
          runId: 'run-1',
          startedAt: '2026-01-01T00:00:00.000Z',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      );
      expect(mockStreamPublisher.publishWorkEventEffect).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishWorkEventEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'started',
          label: 'Agent started',
          runId: 'run-1',
          status: 'running',
          threadId: 'thread-1',
        }),
      );
    });

    it('swallows publisher failures via catchAll', async () => {
      mockStreamPublisher.publishStreamStartEffect.mockReturnValueOnce(
        Effect.fail('boom'),
      );

      await expect(
        runEffectPromise(
          serviceWithRuns.publishStreamLifecycleStartedEffect({
            context,
            model: 'gpt-5',
            threadId: 'thread-1',
          }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('publishStreamCompletionEffect', () => {
    it('publishes done followed by a completed work event', async () => {
      await runEffectPromise(
        serviceWithRuns.publishStreamCompletionEffect({
          completionMetadata: { foo: 'bar' },
          content: 'final content',
          context,
          creditsRemaining: 20,
          creditsUsed: 3,
          durationMs: 500,
          threadId: 'thread-1',
          toolCalls: [
            {
              creditsUsed: 3,
              durationMs: 500,
              status: 'completed',
              toolName: 'search',
            },
          ],
        }),
      );

      expect(mockStreamPublisher.publishDoneEffect).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishDoneEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          creditsRemaining: 20,
          creditsUsed: 3,
          fullContent: 'final content',
          metadata: { foo: 'bar' },
          runId: 'run-1',
          threadId: 'thread-1',
        }),
      );
      expect(mockStreamPublisher.publishWorkEventEffect).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishWorkEventEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: '1 tool call completed',
          event: 'completed',
          label: 'Agent completed',
          runId: 'run-1',
          status: 'completed',
          threadId: 'thread-1',
        }),
      );
    });

    it('pluralizes the tool call count in the work event detail', async () => {
      await runEffectPromise(
        serviceWithRuns.publishStreamCompletionEffect({
          completionMetadata: {},
          content: 'final content',
          context,
          creditsRemaining: 20,
          creditsUsed: 3,
          threadId: 'thread-1',
          toolCalls: [
            {
              creditsUsed: 1,
              durationMs: 10,
              status: 'completed',
              toolName: 'search',
            },
            {
              creditsUsed: 2,
              durationMs: 20,
              status: 'completed',
              toolName: 'fetch',
            },
          ],
        }),
      );

      expect(mockStreamPublisher.publishWorkEventEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: '2 tool calls completed',
        }),
      );
    });
  });

  describe('publishStreamCancelledEffect', () => {
    it('publishes a cancellation error followed by a cancelled work event', async () => {
      await runEffectPromise(
        serviceWithRuns.publishStreamCancelledEffect(context, 'thread-1'),
      );

      expect(mockStreamPublisher.publishErrorEffect).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishErrorEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Agent run cancelled',
          runId: 'run-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      );
      expect(mockStreamPublisher.publishWorkEventEffect).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishWorkEventEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'The active run was stopped by the user.',
          event: 'cancelled',
          label: 'Agent cancelled',
          status: 'cancelled',
          threadId: 'thread-1',
        }),
      );
    });
  });

  describe('publishStreamErrorOnlyEffect', () => {
    it('publishes only an error effect with no accompanying work event', async () => {
      await runEffectPromise(
        serviceWithRuns.publishStreamErrorOnlyEffect(
          context,
          'thread-1',
          'something broke',
        ),
      );

      expect(mockStreamPublisher.publishErrorEffect).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishErrorEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'something broke',
          runId: 'run-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      );
      expect(mockStreamPublisher.publishWorkEventEffect).not.toHaveBeenCalled();
    });
  });

  describe('publishStreamFailureEffect', () => {
    it('fails the run and publishes error + failed work event when failRun is set', async () => {
      await runEffectPromise(
        serviceWithRuns.publishStreamFailureEffect({
          context,
          error: 'run exploded',
          failRun: true,
          threadId: 'thread-1',
        }),
      );

      expect(mockAgentRunsService.fail).toHaveBeenCalledOnce();
      expect(mockAgentRunsService.fail).toHaveBeenCalledWith(
        'run-1',
        'org-1',
        'run exploded',
      );
      expect(mockStreamPublisher.publishErrorEffect).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishErrorEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'run exploded',
          runId: 'run-1',
          threadId: 'thread-1',
        }),
      );
      expect(mockStreamPublisher.publishWorkEventEffect).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishWorkEventEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'run exploded',
          event: 'failed',
          label: 'Agent failed',
          status: 'failed',
          threadId: 'thread-1',
        }),
      );
    });

    it('does not fail the run when failRun is false, but still publishes effects', async () => {
      await runEffectPromise(
        serviceWithRuns.publishStreamFailureEffect({
          context,
          error: 'run exploded',
          failRun: false,
          threadId: 'thread-1',
        }),
      );

      expect(mockAgentRunsService.fail).not.toHaveBeenCalled();
      expect(mockStreamPublisher.publishErrorEffect).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishWorkEventEffect).toHaveBeenCalledOnce();
    });

    it('does not fail the run when there is no runId', async () => {
      await runEffectPromise(
        serviceWithRuns.publishStreamFailureEffect({
          context: { organizationId: 'org-1', userId: 'user-1' },
          error: 'run exploded',
          failRun: true,
          threadId: 'thread-1',
        }),
      );

      expect(mockAgentRunsService.fail).not.toHaveBeenCalled();
      expect(mockStreamPublisher.publishErrorEffect).toHaveBeenCalledOnce();
    });

    it('does not fail the run when agentRunsService is absent, but still publishes effects', async () => {
      await runEffectPromise(
        serviceWithoutRuns.publishStreamFailureEffect({
          context,
          error: 'run exploded',
          failRun: true,
          threadId: 'thread-1',
        }),
      );

      expect(mockAgentRunsService.fail).not.toHaveBeenCalled();
      expect(mockStreamPublisher.publishErrorEffect).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishWorkEventEffect).toHaveBeenCalledOnce();
    });

    it('swallows agentRunsService.fail rejections via catchAll', async () => {
      mockAgentRunsService.fail.mockRejectedValueOnce(new Error('db down'));

      await expect(
        runEffectPromise(
          serviceWithRuns.publishStreamFailureEffect({
            context,
            error: 'run exploded',
            failRun: true,
            threadId: 'thread-1',
          }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('publishStreamAssistantResponseEffect', () => {
    it('publishes reasoning then streams the content word by word', async () => {
      await runEffectPromise(
        serviceWithRuns.publishStreamAssistantResponseEffect({
          content: 'hello world',
          context,
          reasoning: 'because reasons',
          threadId: 'thread-1',
        }),
      );

      expect(mockStreamPublisher.publishReasoningEffect).toHaveBeenCalledOnce();
      expect(mockStreamPublisher.publishReasoningEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'because reasons',
          runId: 'run-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      );
      expect(mockStreamPublisher.publishTokenEffect).toHaveBeenCalled();
    });

    it('skips token streaming entirely when suppressTokenStreaming is set', async () => {
      await runEffectPromise(
        serviceWithRuns.publishStreamAssistantResponseEffect({
          content: 'hello world',
          context,
          reasoning: null,
          suppressTokenStreaming: true,
          threadId: 'thread-1',
        }),
      );

      expect(mockStreamPublisher.publishReasoningEffect).not.toHaveBeenCalled();
      expect(mockStreamPublisher.publishTokenEffect).not.toHaveBeenCalled();
    });
  });
});
