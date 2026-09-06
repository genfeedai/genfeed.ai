import { AgentOrchestratorUiActionFinalizerService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-finalizer.service';
import { describe, expect, it, vi } from 'vitest';

describe('structured action finalization', () => {
  it.each([undefined, true, false])(
    'records the correct terminal event for success=%s',
    async (success) => {
      const recorder = {
        recordAssistantFinalized: vi.fn(),
        recordRunCompleted: vi.fn(),
        recordRunFailed: vi.fn(),
      };
      const messages = { addMessage: vi.fn() };
      const service = new AgentOrchestratorUiActionFinalizerService(
        messages as never,
        {
          getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
        } as never,
        {
          buildAssistantUiActions: vi.fn(() => ({
            uiActions: [],
            suggestedActions: [],
          })),
        } as never,
        recorder as never,
      );
      await service.finalizeStructuredAssistantTurn({
        content:
          success === false ? 'Approved action failed.' : 'Action completed.',
        context: { organizationId: 'org-1', userId: 'user-1' },
        model: 'test',
        threadId: 'thread-1',
        toolCalls: [],
        result: {
          ...(success === undefined ? {} : { success }),
          ...(success === false ? { error: 'Provider unavailable' } : {}),
        },
      });
      expect(messages.addMessage).toHaveBeenCalledTimes(1);
      if (success === false) {
        expect(recorder.recordRunFailed).toHaveBeenCalledWith(
          expect.objectContaining({ error: 'Provider unavailable' }),
        );
        expect(recorder.recordRunCompleted).not.toHaveBeenCalled();
      } else {
        expect(recorder.recordRunCompleted).toHaveBeenCalledTimes(1);
        expect(recorder.recordRunFailed).not.toHaveBeenCalled();
      }
    },
  );
});
