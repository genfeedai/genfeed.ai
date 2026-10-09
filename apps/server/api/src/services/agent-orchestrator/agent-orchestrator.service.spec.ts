import { runWithActionOrigin } from '@api/action-origin/action-origin.context';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import type { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type { AgentTurnAcceptanceService } from '@api/services/agent-orchestrator/agent-turn-acceptance.service';
import { ActionOrigin } from '@genfeedai/contracts';
import type { ValidatedAgentScope } from '@genfeedai/contracts/interfaces';
import {
  GenerationEntryAttribution,
  GenerationEntryChannel,
} from '@genfeedai/contracts/interfaces/content/generation-entry.interface';
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

  it('captures the invocation for queued confirmations and input responses', async () => {
    const generationEntry = {
      channel: GenerationEntryChannel.DESKTOP,
      attribution: GenerationEntryAttribution.CLIENT_REPORTED,
    };
    await runWithActionOrigin(
      { origin: ActionOrigin.UI, generationEntry },
      async () => {
        await service().handleThreadUiAction(request, context);
        await service().resumeRecurringTaskDraftFromInput({
          ...context,
          answer: 'Continue',
          threadId: 'thread-1',
          scope: {
            organizationId: 'org-1',
            brandId: 'brand-1',
            contextVersion: 1,
            isLegacyFallback: false,
            isVersionExplicit: true,
            source: 'explicit',
            threadId: 'thread-1',
            userId: 'user-1',
          } satisfies ValidatedAgentScope,
        });
      },
    );
    expect(
      workflowRunner.enqueueWorkflow.mock.calls[0][0].inputValues.request
        .generationEntry,
    ).toEqual(generationEntry);
    expect(
      workflowRunner.enqueueWorkflow.mock.calls[1][0].inputValues.request
        .generationEntry,
    ).toEqual(generationEntry);
    await service().handleThreadUiAction(request, context);
    expect(
      workflowRunner.enqueueWorkflow.mock.calls[2][0].inputValues.request
        .generationEntry,
    ).toBeUndefined();
  });

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
