import {
  TurboRewriteItemFailureReason,
  TurboRewriteJobStatus,
} from '@genfeedai/contracts';
import type {
  IBackgroundTaskUpdateEvent,
  ITurboRewriteJob,
} from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTurboRewriteJob } from './useTurboRewriteJob';

const mocks = vi.hoisted(() => {
  const handlers = new Map<
    string,
    (event: IBackgroundTaskUpdateEvent) => void
  >();
  const service = {
    cancelRewriteJob: vi.fn(),
    createRewriteJob: vi.fn(),
    getActiveRewriteJob: vi.fn(),
    getRewriteJob: vi.fn(),
  };
  return {
    getTurboRunsService: async () => service,
    service,
    handlers,
    socket: {
      connectionState: 'connected',
      isReady: true,
      subscribe: (
        event: string,
        handler: (payload: IBackgroundTaskUpdateEvent) => void,
      ) => {
        handlers.set(event, handler);
        return () => handlers.delete(event);
      },
    },
    notifications: {
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
  };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getTurboRunsService,
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => mocks.socket,
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => mocks.notifications },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (id: string) => `catalog:${id}`,
}));

function buildJob(overrides: Partial<ITurboRewriteJob> = {}): ITurboRewriteJob {
  return {
    turboRunId: 'batch-1',
    completedItemIds: [],
    failedItems: [],
    id: 'job-1',
    isCancelRequested: false,
    itemIds: ['item-1', 'item-2'],
    status: TurboRewriteJobStatus.PROCESSING,
    ...overrides,
  };
}

function emit(taskId: string) {
  act(() => {
    mocks.handlers.get('background-task-update')?.({
      status: 'processing',
      taskId,
    });
  });
}

describe('useTurboRewriteJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.service.getActiveRewriteJob.mockResolvedValue(null);
  });

  it('queues a rewrite and marks its items as rewriting', async () => {
    mocks.service.createRewriteJob.mockResolvedValue(
      buildJob({ status: TurboRewriteJobStatus.QUEUED }),
    );
    mocks.service.getRewriteJob.mockResolvedValue(
      buildJob({ status: TurboRewriteJobStatus.QUEUED }),
    );
    const { result } = renderHook(() =>
      useTurboRewriteJob({ turboRunId: 'batch-1', onItemsRewritten: vi.fn() }),
    );
    await waitFor(() =>
      expect(mocks.service.getActiveRewriteJob).toHaveBeenCalled(),
    );

    let isStarted = false;
    await act(async () => {
      isStarted = await result.current.startRewrite(['item-1', 'item-2']);
    });

    expect(isStarted).toBe(true);
    expect(mocks.service.createRewriteJob).toHaveBeenCalledWith('batch-1', [
      'item-1',
      'item-2',
    ]);
    expect([...result.current.rewritingIds]).toEqual(['item-1', 'item-2']);
    expect(result.current.rewriteProgress?.job.id).toBe('job-1');
  });

  it('reports a rewrite that could not be queued', async () => {
    mocks.service.createRewriteJob.mockRejectedValue(new Error('409'));
    const { result } = renderHook(() =>
      useTurboRewriteJob({ turboRunId: 'batch-1', onItemsRewritten: vi.fn() }),
    );

    let isStarted = true;
    await act(async () => {
      isStarted = await result.current.startRewrite(['item-1']);
    });

    expect(isStarted).toBe(false);
    expect(mocks.notifications.error).toHaveBeenCalledWith('catalog:error');
    expect(result.current.rewriteProgress).toBeNull();
  });

  it('resumes the active job, refreshes rows as items land, and announces the outcome once', async () => {
    const onItemsRewritten = vi.fn();
    mocks.service.getActiveRewriteJob.mockResolvedValue(buildJob());
    mocks.service.getRewriteJob.mockResolvedValue(buildJob());
    const { result } = renderHook(() =>
      useTurboRewriteJob({ turboRunId: 'batch-1', onItemsRewritten }),
    );
    await waitFor(() => expect(result.current.rewriteProgress).not.toBeNull());

    mocks.service.getRewriteJob.mockResolvedValue(
      buildJob({ completedItemIds: ['item-1'] }),
    );
    emit('another-task');
    emit('job-1');
    // The hook calls onItemsRewritten in the same tick as setJob, before React
    // commits the update: wait for the rendered state, not the callback.
    await waitFor(() =>
      expect([...result.current.rewritingIds]).toEqual(['item-2']),
    );
    expect(onItemsRewritten).toHaveBeenCalledTimes(1);

    mocks.service.getRewriteJob.mockResolvedValue(
      buildJob({
        completedItemIds: ['item-1'],
        failedItems: [
          {
            itemId: 'item-2',
            reason: TurboRewriteItemFailureReason.CONFLICT,
          },
        ],
        status: TurboRewriteJobStatus.PARTIALLY_FAILED,
      }),
    );
    emit('job-1');
    await waitFor(() => expect(result.current.rewriteProgress).toBeNull());

    expect(mocks.notifications.warning).toHaveBeenCalledOnce();
    expect(mocks.notifications.warning).toHaveBeenCalledWith('catalog:partial');
    expect(onItemsRewritten).toHaveBeenCalledTimes(2);
    expect(mocks.service.getRewriteJob).toHaveBeenCalledWith(
      'batch-1',
      'job-1',
      expect.any(AbortSignal),
    );
  });

  it('asks the job to stop and reflects the pending cancellation', async () => {
    mocks.service.getActiveRewriteJob.mockResolvedValue(buildJob());
    mocks.service.getRewriteJob.mockResolvedValue(buildJob());
    mocks.service.cancelRewriteJob.mockResolvedValue(
      buildJob({ isCancelRequested: true }),
    );
    const { result } = renderHook(() =>
      useTurboRewriteJob({ turboRunId: 'batch-1', onItemsRewritten: vi.fn() }),
    );
    await waitFor(() => expect(result.current.rewriteProgress).not.toBeNull());

    act(() => result.current.rewriteProgress?.onCancel());

    await waitFor(() =>
      expect(result.current.rewriteProgress?.isCancelling).toBe(true),
    );
    expect(mocks.service.cancelRewriteJob).toHaveBeenCalledWith(
      'batch-1',
      'job-1',
    );
  });

  it('reports a run that ran out of credits', async () => {
    mocks.service.getActiveRewriteJob.mockResolvedValue(buildJob());
    mocks.service.getRewriteJob.mockResolvedValue(
      buildJob({
        failedItems: [
          {
            itemId: 'item-1',
            reason: TurboRewriteItemFailureReason.INSUFFICIENT_CREDITS,
          },
          {
            itemId: 'item-2',
            reason: TurboRewriteItemFailureReason.INSUFFICIENT_CREDITS,
          },
        ],
        status: TurboRewriteJobStatus.FAILED,
      }),
    );
    renderHook(() =>
      useTurboRewriteJob({ turboRunId: 'batch-1', onItemsRewritten: vi.fn() }),
    );

    await waitFor(() =>
      expect(mocks.notifications.error).toHaveBeenCalledWith(
        'catalog:insufficientCredits',
      ),
    );
  });
});
