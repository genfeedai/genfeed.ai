import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import type { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type { AgentTurnAcceptanceService } from '@api/services/agent-orchestrator/agent-turn-acceptance.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentOrchestratorService.handleThreadUiAction', () => {
  const workflowRunner = { enqueueWorkflow: vi.fn() };
  const recorder = { recordUiActionQueued: vi.fn() };
  const context = { organizationId: 'org-1', userId: 'user-1' };
  const request = {
    action: 'confirm_generate_media',
    payload: { generationType: 'image', sourceActionId: 'proposal-1' },
    threadId: 'thread-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    workflowRunner.enqueueWorkflow.mockResolvedValue({
      executionId: 'exec-1',
    });
  });

  function service(withRecorder = true) {
    return new AgentOrchestratorService(
      {} as AgentTurnAcceptanceService,
      workflowRunner as unknown as SystemWorkflowRunnerService,
      withRecorder
        ? (recorder as unknown as AgentThreadEventRecorderService)
        : undefined,
    );
  }

  it('acks with the queued run after recording it on the thread log', async () => {
    await expect(
      service().handleThreadUiAction(request, context),
    ).resolves.toEqual({
      executionId: 'exec-1',
      status: 'queued',
      threadId: 'thread-1',
    });

    expect(recorder.recordUiActionQueued).toHaveBeenCalledWith({
      content: 'Confirmed image generation.',
      context: { ...context, executionId: 'exec-1' },
      runId: 'exec-1',
      threadId: 'thread-1',
      uiAction: { action: 'confirm_generate_media', sourceId: 'proposal-1' },
    });
    expect(
      workflowRunner.enqueueWorkflow.mock.invocationCallOrder[0],
    ).toBeLessThan(recorder.recordUiActionQueued.mock.invocationCallOrder[0]);
  });

  it('still acks when the queued record fails; the worker records it again', async () => {
    recorder.recordUiActionQueued.mockRejectedValue(
      new Error('Thread not found'),
    );

    await expect(
      service().handleThreadUiAction(request, context),
    ).resolves.toMatchObject({ executionId: 'exec-1', status: 'queued' });
  });

  it('acks without a recorder (worker-only module graph)', async () => {
    await expect(
      service(false).handleThreadUiAction(request, context),
    ).resolves.toMatchObject({ executionId: 'exec-1' });
  });
});
