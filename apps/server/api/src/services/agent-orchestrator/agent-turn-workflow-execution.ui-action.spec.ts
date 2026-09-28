import { AgentTurnWorkflowExecutionService } from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service';
import type { AgentChatResult } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

/**
 * A ui-action run's result reaches the client as the turn channel's own
 * `agent:done` / `agent:error`, tagged with the thread's event position.
 */
function setup(handle: () => Promise<AgentChatResult>) {
  const uiActionService = { handleThreadUiAction: vi.fn(handle) };
  const streamEffects = {
    publishUiActionDone: vi.fn(),
    publishUiActionFailure: vi.fn(),
  };
  const threadEventRecorder = {
    readRunTerminalSequence: vi.fn().mockResolvedValue(12),
    recordRunFailed: vi.fn(),
  };
  const dependencies: unknown[] = Array.from({ length: 18 }, () => ({}));
  dependencies[12] = uiActionService;
  dependencies[13] = streamEffects;
  dependencies[14] = threadEventRecorder;
  const service = Reflect.construct(
    AgentTurnWorkflowExecutionService,
    dependencies,
  ) as AgentTurnWorkflowExecutionService;
  return { service, streamEffects, threadEventRecorder, uiActionService };
}

const context = {
  executionId: 'exec-1',
  organizationId: 'org',
  userId: 'user',
};
const request = {
  action: 'confirm_generate_media',
  payload: { generationType: 'image', sourceActionId: 'proposal-1' },
  threadId: 'thread-1',
};
const result: AgentChatResult = {
  brandId: 'brand-1',
  contextVersion: 4,
  creditsRemaining: 90,
  creditsUsed: 3,
  message: {
    content: 'Image generated.',
    metadata: { uiActions: [] },
    role: 'assistant',
  },
  threadId: 'thread-1',
  toolCalls: [],
};

describe('AgentTurnWorkflowExecutionService.executeUiAction', () => {
  it('announces the run result on the turn channel with the thread position', async () => {
    const { service, streamEffects, threadEventRecorder } = setup(
      async () => result,
    );

    await expect(service.executeUiAction(request, context)).resolves.toBe(
      result,
    );

    expect(threadEventRecorder.readRunTerminalSequence).toHaveBeenCalledWith({
      organizationId: 'org',
      runId: 'exec-1',
      threadId: 'thread-1',
    });
    expect(streamEffects.publishUiActionDone).toHaveBeenCalledWith({
      context,
      result,
      sequence: 12,
      threadId: 'thread-1',
      uiAction: { action: 'confirm_generate_media', sourceId: 'proposal-1' },
    });
    expect(streamEffects.publishUiActionFailure).not.toHaveBeenCalled();
  });

  it('records and announces a sanitized failure, then rethrows', async () => {
    const failure = new BadRequestException(
      'This plan has already been approved.',
    );
    const { service, streamEffects, threadEventRecorder } = setup(async () => {
      throw failure;
    });

    await expect(service.executeUiAction(request, context)).rejects.toBe(
      failure,
    );

    expect(threadEventRecorder.recordRunFailed).toHaveBeenCalledWith({
      context,
      error: 'This plan has already been approved.',
      runId: 'exec-1',
      threadId: 'thread-1',
    });
    expect(streamEffects.publishUiActionFailure).toHaveBeenCalledWith({
      context,
      error: 'This plan has already been approved.',
      sequence: 12,
      threadId: 'thread-1',
      uiAction: { action: 'confirm_generate_media', sourceId: 'proposal-1' },
    });
    expect(streamEffects.publishUiActionDone).not.toHaveBeenCalled();
  });

  it('never announces the text of an unexpected error', async () => {
    const { service, streamEffects } = setup(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.7:5432');
    });

    await expect(service.executeUiAction(request, context)).rejects.toThrow(
      'ECONNREFUSED',
    );

    expect(streamEffects.publishUiActionFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'The action failed before it finished.',
      }),
    );
  });

  it('keeps a deliberate server error message the card formats', async () => {
    const { service, streamEffects } = setup(async () => {
      throw new InternalServerErrorException(
        'Generation failed with status 422: invalid version',
      );
    });

    await expect(service.executeUiAction(request, context)).rejects.toThrow();

    expect(streamEffects.publishUiActionFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Generation failed with status 422: invalid version',
      }),
    );
  });

  it('still announces a failure the thread log cannot take', async () => {
    const { service, streamEffects, threadEventRecorder } = setup(async () => {
      throw new BadRequestException('Thread not found or inaccessible.');
    });
    threadEventRecorder.recordRunFailed.mockRejectedValue(
      new Error('Thread not found'),
    );

    await expect(service.executeUiAction(request, context)).rejects.toThrow(
      'Thread not found or inaccessible.',
    );

    expect(streamEffects.publishUiActionFailure).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Thread not found or inaccessible.' }),
    );
  });
});
