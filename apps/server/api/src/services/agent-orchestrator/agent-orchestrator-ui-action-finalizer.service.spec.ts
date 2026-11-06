import type { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentOrchestratorUiActionFinalizerService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-finalizer.service';
import type { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface StoredMessage {
  id: string;
  metadata: Record<string, unknown>;
}

describe('structured action finalization', () => {
  let messages: StoredMessage[];
  let events: Array<{ input: Record<string, unknown>; kind: string }>;
  let service: AgentOrchestratorUiActionFinalizerService;

  beforeEach(() => {
    messages = [];
    events = [];
    const record =
      (kind: string) =>
      async (input: Record<string, unknown>): Promise<void> => {
        events.push({ input, kind });
      };

    service = new AgentOrchestratorUiActionFinalizerService(
      {
        addMessage: async (message: StoredMessage) => {
          messages.push(message);
          return message;
        },
      } as unknown as AgentMessagesService,
      {
        getOrganizationCreditsBalance: async () => 100,
      } as unknown as CreditsUtilsService,
      {
        buildAssistantUiActions: () => ({
          suggestedActions: [],
          uiActions: [],
        }),
      } as unknown as AgentCompletionCardBuilderService,
      {
        recordAssistantFinalized: record('assistant-finalized'),
        recordRunCompleted: record('run-completed'),
        recordRunFailed: record('run-failed'),
      } as unknown as AgentThreadEventRecorderService,
    );
  });

  function finalize(result: Record<string, unknown>, content: string) {
    return service.finalizeStructuredAssistantTurn({
      content,
      context: {
        executionId: 'exec-ui-action-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      messageId: 'result-message-1',
      model: 'test',
      result,
      threadId: 'thread-1',
      toolCalls: [],
    });
  }

  it.each([
    ['no success flag', {}],
    ['success=true', { success: true }],
  ])('completes the run for %s', async (_label, result) => {
    const finalized = await finalize(result, 'Action completed.');

    expect(finalized.runOutcome).toBeUndefined();
    expect(events.map((event) => event.kind)).toEqual([
      'assistant-finalized',
      'run-completed',
    ]);
    // The client correlates the ui-action ack with this reply by runId.
    expect(messages).toEqual([
      expect.objectContaining({
        id: 'result-message-1',
        metadata: expect.objectContaining({
          creditsRemaining: 100,
          runId: 'exec-ui-action-1',
        }),
      }),
    ]);
    expect(messages[0]?.metadata).not.toHaveProperty('runOutcome');
  });

  it('fails the run without throwing when the approved action failed', async () => {
    const finalized = await finalize(
      { error: 'Provider unavailable', success: false },
      'Approved action failed.',
    );

    // The result carries the terminal outcome, so the announcement settles
    // the run as failed.
    expect(finalized.runOutcome).toEqual({
      error: 'Provider unavailable',
      status: 'failed',
    });
    expect(events).toEqual([
      expect.objectContaining({ kind: 'assistant-finalized' }),
      {
        input: expect.objectContaining({ error: 'Provider unavailable' }),
        kind: 'run-failed',
      },
    ]);
    // The reply persists the outcome for a client that missed the event.
    expect(messages).toEqual([
      expect.objectContaining({
        id: 'result-message-1',
        metadata: expect.objectContaining({
          creditsRemaining: 100,
          runId: 'exec-ui-action-1',
          runOutcome: { error: 'Provider unavailable', status: 'failed' },
        }),
      }),
    ]);
  });
});
