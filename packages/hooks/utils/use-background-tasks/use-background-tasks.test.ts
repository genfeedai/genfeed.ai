import { useBackgroundTasks } from '@hooks/utils/use-background-tasks/use-background-tasks';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const unsubscribeMock = vi.fn();
const subscribeMock = vi.fn(() => unsubscribeMock);
const upsertTaskFromEventMock = vi.fn();
const infoMock = vi.fn();
const pushMock = vi.fn();

vi.mock('@contexts/ui/background-task-context', () => ({
  useBackgroundTaskContext: () => ({
    upsertTaskFromEvent: upsertTaskFromEventMock,
  }),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    isReady: true,
    subscribe: subscribeMock,
  }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      info: infoMock,
    }),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe('useBackgroundTasks', () => {
  afterEach(() => {
    subscribeMock.mockClear();
    unsubscribeMock.mockClear();
    upsertTaskFromEventMock.mockClear();
    infoMock.mockClear();
    pushMock.mockClear();
  });

  it('subscribes to background-task-update events', () => {
    renderHook(() => useBackgroundTasks());

    expect(subscribeMock).toHaveBeenCalledWith(
      'background-task-update',
      expect.any(Function),
    );
  });

  it('forwards valid events to context', () => {
    renderHook(() => useBackgroundTasks());
    const callback = subscribeMock.mock.calls[0][1] as (
      event: Record<string, unknown>,
    ) => void;

    callback({ status: 'processing', taskId: 'task-1' });
    callback({ status: 'processing' });

    expect(upsertTaskFromEventMock).toHaveBeenCalledTimes(1);
    expect(upsertTaskFromEventMock).toHaveBeenCalledWith({
      status: 'processing',
      taskId: 'task-1',
    });
  });

  it('shows a linked toast when a new background task starts', () => {
    renderHook(() => useBackgroundTasks());
    const callback = subscribeMock.mock.calls[0][1] as (
      event: Record<string, unknown>,
    ) => void;

    callback({
      label: 'Image Generation',
      status: 'processing',
      taskId: 'task-1',
    });

    expect(infoMock).toHaveBeenCalledWith('Image Generation started', {
      actionLabel: 'View',
      description: 'Track progress from the linked task view.',
      duration: 5_000,
      onAction: expect.any(Function),
    });
  });

  it('does not re-toast repeated processing updates for the same task', () => {
    renderHook(() => useBackgroundTasks());
    const callback = subscribeMock.mock.calls[0][1] as (
      event: Record<string, unknown>,
    ) => void;

    callback({
      label: 'Workflow execution',
      resultType: 'WORKFLOW',
      status: 'processing',
      taskId: 'exec-1',
    });
    callback({
      label: 'Workflow execution',
      resultType: 'WORKFLOW',
      status: 'processing',
      taskId: 'exec-1',
    });

    expect(infoMock).toHaveBeenCalledTimes(1);
  });

  it('navigates to the inferred destination when the toast action is clicked', () => {
    renderHook(() => useBackgroundTasks());
    const callback = subscribeMock.mock.calls[0][1] as (
      event: Record<string, unknown>,
    ) => void;

    callback({
      label: 'Workflow execution',
      resultType: 'WORKFLOW',
      status: 'processing',
      taskId: 'exec-42',
    });

    const options = infoMock.mock.calls[0][1] as { onAction: () => void };
    options.onAction();

    expect(pushMock).toHaveBeenCalledWith('/workflows/executions/exec-42');
  });

  it('cleans up subscription on unmount', () => {
    const { unmount } = renderHook(() => useBackgroundTasks());
    unmount();

    expect(unsubscribeMock).toHaveBeenCalled();
  });
});
