import { AgentTurnWorkflowExecutionService } from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service';
import type { AgentChatResult } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';

type Announcement = Record<string, unknown> & { kind: 'done' | 'failure' };

/**
 * A ui-action run's result reaches the client as the turn channel's own
 * `agent:done` / `agent:error`, tagged with the thread's event position.
 */
function setup(
  handle: () => Promise<AgentChatResult>,
  { isThreadLogDown = false } = {},
) {
  const world = {
    // What the client sees on the turn channel.
    channel: [] as Announcement[],
    // The thread's persisted run log and terminal positions.
    failedRuns: [] as unknown[],
    terminalSequences: new Map([['org:thread-1:exec-1', 12]]),
  };
  const dependencies: unknown[] = Array.from({ length: 18 }, () => ({}));
  dependencies[12] = { handleThreadUiAction: handle };
  dependencies[13] = {
    publishUiActionDone: (input: Record<string, unknown>) => {
      world.channel.push({ kind: 'done', ...input });
    },
    publishUiActionFailure: (input: Record<string, unknown>) => {
      world.channel.push({ kind: 'failure', ...input });
    },
  };
  dependencies[14] = {
    readRunTerminalSequence: async (input: {
      organizationId: string;
      runId: string;
      threadId: string;
    }) =>
      world.terminalSequences.get(
        `${input.organizationId}:${input.threadId}:${input.runId}`,
      ),
    recordRunFailed: async (input: unknown) => {
      if (isThreadLogDown) {
        throw new Error('Thread not found');
      }
      world.failedRuns.push(input);
    },
  };
  const service = Reflect.construct(
    AgentTurnWorkflowExecutionService,
    dependencies,
  ) as AgentTurnWorkflowExecutionService;
  return { service, world };
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
  const uiAction = { action: 'confirm_generate_media', sourceId: 'proposal-1' };

  it('announces the run result on the turn channel with the thread position', async () => {
    const { service, world } = setup(async () => result);

    await expect(service.executeUiAction(request, context)).resolves.toBe(
      result,
    );

    expect(world.channel).toEqual([
      {
        context,
        kind: 'done',
        result,
        sequence: 12,
        threadId: 'thread-1',
        uiAction,
      },
    ]);
    expect(world.failedRuns).toEqual([]);
  });

  it('records and announces a sanitized failure, then rethrows', async () => {
    const failure = new BadRequestException(
      'This plan has already been approved.',
    );
    const { service, world } = setup(async () => {
      throw failure;
    });

    await expect(service.executeUiAction(request, context)).rejects.toBe(
      failure,
    );

    expect(world.failedRuns).toEqual([
      {
        context,
        error: 'This plan has already been approved.',
        runId: 'exec-1',
        threadId: 'thread-1',
      },
    ]);
    expect(world.channel).toEqual([
      {
        context,
        error: 'This plan has already been approved.',
        kind: 'failure',
        sequence: 12,
        threadId: 'thread-1',
        uiAction,
      },
    ]);
  });

  it('never announces the text of an unexpected error', async () => {
    const { service, world } = setup(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.7:5432');
    });

    await expect(service.executeUiAction(request, context)).rejects.toThrow(
      'ECONNREFUSED',
    );

    expect(world.channel).toEqual([
      expect.objectContaining({
        error: 'The action failed before it finished.',
        kind: 'failure',
      }),
    ]);
  });

  it('keeps a deliberate server error message the card formats', async () => {
    const { service, world } = setup(async () => {
      throw new InternalServerErrorException(
        'Generation failed with status 422: invalid version',
      );
    });

    await expect(service.executeUiAction(request, context)).rejects.toThrow();

    expect(world.channel).toEqual([
      expect.objectContaining({
        error: 'Generation failed with status 422: invalid version',
        kind: 'failure',
      }),
    ]);
  });

  it('still announces a failure the thread log cannot take', async () => {
    const { service, world } = setup(
      async () => {
        throw new BadRequestException('Thread not found or inaccessible.');
      },
      { isThreadLogDown: true },
    );

    await expect(service.executeUiAction(request, context)).rejects.toThrow(
      'Thread not found or inaccessible.',
    );

    expect(world.failedRuns).toEqual([]);
    expect(world.channel).toEqual([
      expect.objectContaining({
        error: 'Thread not found or inaccessible.',
        kind: 'failure',
      }),
    ]);
  });
});
