import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { Effect } from 'effect';

const context: AgentChatContext = {
  organizationId: 'org-1',
  userId: 'user-1',
};

const mockAgentThreadEngineService = {
  appendEventEffect: vi.fn(() => Effect.void),
};

describe('AgentThreadEventRecorderService', () => {
  let serviceWithEngine: AgentThreadEventRecorderService;
  let serviceWithoutEngine: AgentThreadEventRecorderService;

  beforeEach(() => {
    vi.clearAllMocks();
    serviceWithEngine = new AgentThreadEventRecorderService(
      mockAgentThreadEngineService as unknown as AgentThreadEngineService,
    );
    serviceWithoutEngine = new AgentThreadEventRecorderService(undefined);
  });

  describe('recordThreadTurnRequested', () => {
    it('appends a thread.turn_requested event when the engine is present', async () => {
      await serviceWithEngine.recordThreadTurnRequested({
        content: 'hello',
        context,
        model: 'gpt-5',
        runId: 'run-1',
        source: 'agent',
        threadId: 'thread-1',
      });

      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledOnce();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'turn-requested:thread-1:run-1',
          organizationId: 'org-1',
          runId: 'run-1',
          threadId: 'thread-1',
          type: 'thread.turn_requested',
          userId: 'user-1',
        }),
      );
    });

    it('is a no-op when the engine is absent', async () => {
      await expect(
        serviceWithoutEngine.recordThreadTurnRequested({
          content: 'hello',
          context,
          model: 'gpt-5',
          threadId: 'thread-1',
        }),
      ).resolves.toBeUndefined();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).not.toHaveBeenCalled();
    });
  });

  describe('recordAssistantFinalized', () => {
    it('appends an assistant.finalized event when the engine is present', async () => {
      await serviceWithEngine.recordAssistantFinalized({
        content: 'done',
        context,
        metadata: { foo: 'bar' },
        runId: 'run-1',
        threadId: 'thread-1',
      });

      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledOnce();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'assistant-finalized:thread-1:run-1',
          organizationId: 'org-1',
          runId: 'run-1',
          threadId: 'thread-1',
          type: 'assistant.finalized',
          userId: 'user-1',
        }),
      );
    });

    it('is a no-op when the engine is absent', async () => {
      await expect(
        serviceWithoutEngine.recordAssistantFinalized({
          content: 'done',
          context,
          metadata: {},
          threadId: 'thread-1',
        }),
      ).resolves.toBeUndefined();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).not.toHaveBeenCalled();
    });
  });

  describe('recordPlanUpserted', () => {
    const plan = {
      awaitingApproval: true,
      content: 'plan content',
      id: 'plan-1',
      status: 'awaiting_approval' as const,
    };

    it('appends a plan.upserted event when the engine is present', async () => {
      await serviceWithEngine.recordPlanUpserted({
        context,
        plan,
        runId: 'run-1',
        threadId: 'thread-1',
      });

      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledOnce();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'plan-upserted:thread-1:plan-1:run-1',
          organizationId: 'org-1',
          runId: 'run-1',
          threadId: 'thread-1',
          type: 'plan.upserted',
          userId: 'user-1',
        }),
      );
    });

    it('is a no-op when the engine is absent', async () => {
      await expect(
        serviceWithoutEngine.recordPlanUpserted({
          context,
          plan,
          threadId: 'thread-1',
        }),
      ).resolves.toBeUndefined();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).not.toHaveBeenCalled();
    });
  });

  describe('recordThreadTurnStarted', () => {
    it('appends a thread.turn_started event when the engine is present', async () => {
      await serviceWithEngine.recordThreadTurnStarted({
        context,
        model: 'gpt-5',
        runId: 'run-1',
        source: 'agent',
        threadId: 'thread-1',
      });

      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledOnce();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'turn-started:thread-1:run-1',
          organizationId: 'org-1',
          runId: 'run-1',
          threadId: 'thread-1',
          type: 'thread.turn_started',
          userId: 'user-1',
        }),
      );
    });

    it('is a no-op when the engine is absent', async () => {
      await expect(
        serviceWithoutEngine.recordThreadTurnStarted({
          context,
          model: 'gpt-5',
          threadId: 'thread-1',
        }),
      ).resolves.toBeUndefined();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).not.toHaveBeenCalled();
    });
  });

  describe('recordToolStarted', () => {
    it('appends a tool.started event when the engine is present', async () => {
      await serviceWithEngine.recordToolStarted({
        context,
        parameters: { query: 'foo' },
        runId: 'run-1',
        threadId: 'thread-1',
        toolCallId: 'call-1',
        toolName: 'search',
      });

      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledOnce();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'tool-started:thread-1:call-1:run-1',
          organizationId: 'org-1',
          runId: 'run-1',
          threadId: 'thread-1',
          type: 'tool.started',
          userId: 'user-1',
        }),
      );
    });

    it('is a no-op when the engine is absent', async () => {
      await expect(
        serviceWithoutEngine.recordToolStarted({
          context,
          parameters: {},
          threadId: 'thread-1',
          toolName: 'search',
        }),
      ).resolves.toBeUndefined();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).not.toHaveBeenCalled();
    });
  });

  describe('recordToolCompleted', () => {
    it('appends a tool.completed event when the engine is present', async () => {
      await serviceWithEngine.recordToolCompleted({
        context,
        durationMs: 120,
        runId: 'run-1',
        status: 'completed',
        threadId: 'thread-1',
        toolCallId: 'call-1',
        toolName: 'search',
      });

      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledOnce();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'tool-completed:thread-1:call-1:run-1',
          organizationId: 'org-1',
          runId: 'run-1',
          threadId: 'thread-1',
          type: 'tool.completed',
          userId: 'user-1',
        }),
      );
    });

    it('is a no-op when the engine is absent', async () => {
      await expect(
        serviceWithoutEngine.recordToolCompleted({
          context,
          durationMs: 120,
          status: 'completed',
          threadId: 'thread-1',
          toolName: 'search',
        }),
      ).resolves.toBeUndefined();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).not.toHaveBeenCalled();
    });
  });

  describe('recordUiBlocksUpdated', () => {
    it('appends a ui.blocks_updated event when the engine is present', async () => {
      await serviceWithEngine.recordUiBlocksUpdated({
        blockIds: ['block-1'],
        context,
        operation: 'add',
        runId: 'run-1',
        threadId: 'thread-1',
      });

      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledOnce();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'ui-blocks:thread-1:run-1:add',
          organizationId: 'org-1',
          runId: 'run-1',
          threadId: 'thread-1',
          type: 'ui.blocks_updated',
          userId: 'user-1',
        }),
      );
    });

    it('is a no-op when the engine is absent', async () => {
      await expect(
        serviceWithoutEngine.recordUiBlocksUpdated({
          context,
          operation: 'add',
          threadId: 'thread-1',
        }),
      ).resolves.toBeUndefined();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).not.toHaveBeenCalled();
    });
  });

  describe('recordRunCompleted', () => {
    it('appends a run.completed event when the engine is present', async () => {
      await serviceWithEngine.recordRunCompleted({
        context,
        detail: 'all good',
        runId: 'run-1',
        threadId: 'thread-1',
      });

      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledOnce();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'run-completed:thread-1:run-1',
          organizationId: 'org-1',
          payload: expect.objectContaining({
            detail: 'all good',
            label: 'Agent completed',
            status: 'completed',
          }),
          runId: 'run-1',
          threadId: 'thread-1',
          type: 'run.completed',
          userId: 'user-1',
        }),
      );
    });

    it('is a no-op when the engine is absent', async () => {
      await expect(
        serviceWithoutEngine.recordRunCompleted({
          context,
          detail: 'all good',
          threadId: 'thread-1',
        }),
      ).resolves.toBeUndefined();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).not.toHaveBeenCalled();
    });
  });

  describe('recordRunFailed', () => {
    it('appends a run.failed event when the engine is present', async () => {
      await serviceWithEngine.recordRunFailed({
        context,
        error: 'boom',
        runId: 'run-1',
        threadId: 'thread-1',
      });

      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledOnce();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'run-failed:thread-1:run-1',
          organizationId: 'org-1',
          payload: expect.objectContaining({
            error: 'boom',
            label: 'Agent failed',
            status: 'failed',
          }),
          runId: 'run-1',
          threadId: 'thread-1',
          type: 'run.failed',
          userId: 'user-1',
        }),
      );
    });

    it('is a no-op when the engine is absent', async () => {
      await expect(
        serviceWithoutEngine.recordRunFailed({
          context,
          error: 'boom',
          threadId: 'thread-1',
        }),
      ).resolves.toBeUndefined();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).not.toHaveBeenCalled();
    });
  });
});
