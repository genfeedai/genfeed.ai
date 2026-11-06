import type { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import type { TurboRunProcessOptions } from '@api/services/turbo-run/turbo-run.types';
import { TurboRunStreamService } from '@api/services/turbo-run/turbo-run-stream.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

/** The thread identity a worker-side run run reconstructs from job data. */
const CONTEXT = {
  runId: 'run-1',
  threadId: 'thread-1',
  turboRunId: 'run-1',
  userId: 'user-1',
};

type ItemContext = Parameters<
  NonNullable<TurboRunProcessOptions['onItemStarted']>
>[0];

const itemContext = (overrides: Record<string, unknown> = {}): ItemContext =>
  ({
    completedCount: 1,
    failedCount: 0,
    index: 0,
    item: { format: 'IMAGE', id: 'item-1', platform: 'instagram' },
    topic: 'launch day',
    totalCount: 2,
    turboRunId: 'run-1',
    ...overrides,
  }) as unknown as ItemContext;

describe('TurboRunStreamService', () => {
  let published: Array<Record<string, unknown>>;
  let isPublisherDown: boolean;
  let warnings: Array<{ context: unknown; message: string }>;
  let logger: LoggerService;
  let service: TurboRunStreamService;

  beforeEach(() => {
    published = [];
    isPublisherDown = false;
    warnings = [];
    logger = {
      error: () => undefined,
      log: () => undefined,
      warn: (message: string, context: unknown) => {
        warnings.push({ context, message });
      },
    } as unknown as LoggerService;
    service = new TurboRunStreamService(logger, {
      publishWorkEvent: async (event: Record<string, unknown>) => {
        if (isPublisherDown) {
          throw new Error('redis unavailable');
        }
        published.push(event);
      },
    } as unknown as AgentStreamPublisherService);
  });

  it('runs silently when no publisher is wired', () => {
    const withoutPublisher = new TurboRunStreamService(logger);

    expect(withoutPublisher.buildProcessOptions(CONTEXT)).toBeUndefined();
  });

  it('opens the run tool call on the live thread', async () => {
    await service.buildProcessOptions(CONTEXT)?.onTurboRunStarted?.({
      totalCount: 2,
      turboRunId: 'run-1',
    });

    expect(published).toEqual([
      expect.objectContaining({
        detail: 'Queued 2 posts for generation.',
        event: 'started',
        label: 'Turbo run started',
        progress: 0,
        runId: 'run-1',
        status: 'running',
        threadId: 'thread-1',
        toolCallId: 'run:run-1',
        toolName: 'generate_turbo_content',
        userId: 'user-1',
      }),
    ]);
  });

  it('gives each item its own tool call id so drafts stream independently', async () => {
    const options = service.buildProcessOptions(CONTEXT);

    await options?.onItemStarted?.(itemContext({ completedCount: 0 }));
    await options?.onItemCompleted?.(
      itemContext({
        postId: 'post-1',
        previewText: 'Launch day is here',
      }),
    );

    expect(published).toEqual([
      expect.objectContaining({
        event: 'tool_started',
        label: 'Generating post 1',
        progress: 0,
        status: 'running',
        toolCallId: 'run:run-1:item:item-1',
      }),
      expect.objectContaining({
        event: 'tool_completed',
        label: 'Generated post 1',
        progress: 50,
        resultSummary: 'Launch day is here',
        status: 'completed',
        toolCallId: 'run:run-1:item:item-1',
      }),
    ]);
  });

  it('reports a failed draft without ending the run call', async () => {
    await service.buildProcessOptions(CONTEXT)?.onItemFailed?.(
      itemContext({
        completedCount: 0,
        error: 'provider refused the prompt',
        failedCount: 1,
        index: 1,
      }),
    );

    expect(published).toEqual([
      expect.objectContaining({
        detail: 'provider refused the prompt',
        label: 'Failed post 2',
        progress: 50,
        resultSummary: 'provider refused the prompt',
        status: 'failed',
        toolCallId: 'run:run-1:item:item-1',
      }),
    ]);
  });

  it('keeps generating when a progress event cannot be published', async () => {
    isPublisherDown = true;

    await expect(
      service.buildProcessOptions(CONTEXT)?.onTurboRunStarted?.({
        totalCount: 2,
        turboRunId: 'run-1',
      }),
    ).resolves.toBeUndefined();
    expect(warnings).toEqual([
      {
        context: expect.objectContaining({
          error: 'redis unavailable',
          turboRunId: 'run-1',
        }),
        message: 'Turbo run run-1 progress event dropped',
      },
    ]);
  });
});
