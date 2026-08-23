import { WorkflowLifecycle } from '@genfeedai/enums';
import { buildSystemWorkflowMetadata } from '@genfeedai/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowSummary } from '@/features/workflows/services/workflow-api';
import { useWorkflowLibraryPage } from './useWorkflowLibraryPage';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  href: vi.fn((path: string) => `/org/brand${path}`),
  push: vi.fn(),
  isConnected: false,
  isCapable: false,
  serviceList: vi.fn(),
  serviceDuplicate: vi.fn(),
  serviceRemove: vi.fn(),
  serviceUpdateSchedule: vi.fn(),
  getService: vi.fn(),
  notificationsError: vi.fn(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/hooks/useCloudSession', () => ({
  useCloudSession: () => ({
    isConnected: mocks.isConnected,
    isCapable: mocks.isCapable,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      success: vi.fn(),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const makeWorkflow = (
  overrides: Partial<WorkflowSummary> = {},
): WorkflowSummary => ({
  id: 'wf-1',
  label: 'Test Workflow',
  lifecycle: WorkflowLifecycle.PUBLISHED,
  nodeCount: 3,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWorkflowLibraryPage — handleToggleSchedule', () => {
  beforeEach(() => {
    mocks.serviceList.mockResolvedValue([
      makeWorkflow({
        id: 'wf-1',
        label: 'Scheduled Workflow',
        schedule: '0 9 * * 1',
        timezone: 'UTC',
        isScheduleEnabled: false,
      }),
      makeWorkflow({
        id: 'wf-2',
        label: 'Unscheduled Workflow',
      }),
    ]);
    mocks.serviceUpdateSchedule.mockResolvedValue({
      id: 'wf-1',
      isScheduleEnabled: true,
      nextRunAt: '2099-01-01T09:00:00.000Z',
      schedule: '0 9 * * 1',
      timezone: 'UTC',
    });
    mocks.getService.mockResolvedValue({
      list: mocks.serviceList,
      duplicate: mocks.serviceDuplicate,
      remove: mocks.serviceRemove,
      updateSchedule: mocks.serviceUpdateSchedule,
    });
  });

  it('requests the maximum page of workflows so schedules are not hidden', async () => {
    renderHook(() => useWorkflowLibraryPage());

    await waitFor(() => expect(mocks.serviceList).toHaveBeenCalled());
    expect(mocks.serviceList).toHaveBeenCalledWith({ limit: 100 });
  });

  it('calls updateSchedule with isScheduleEnabled=true when toggling on a workflow that has a schedule', async () => {
    const { result } = renderHook(() => useWorkflowLibraryPage());

    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    await act(async () => {
      await result.current.handleToggleSchedule('wf-1', true);
    });

    expect(mocks.serviceUpdateSchedule).toHaveBeenCalledWith('wf-1', {
      isScheduleEnabled: true,
      schedule: '0 9 * * 1',
      timezone: 'UTC',
    });
  });

  it('reflects the derived next run after the toggle resolves', async () => {
    const { result } = renderHook(() => useWorkflowLibraryPage());
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    await act(async () => {
      await result.current.handleToggleSchedule('wf-1', true);
    });

    const wf = result.current.workflows.find((w) => w.id === 'wf-1');
    expect(wf?.nextRunAt).toBe('2099-01-01T09:00:00.000Z');
  });

  it('applies an optimistic update before the API resolves', async () => {
    let resolveSchedule!: (value: {
      id: string;
      nextRunAt: string | null;
    }) => void;
    mocks.serviceUpdateSchedule.mockImplementation(
      () =>
        new Promise<{ id: string; nextRunAt: string | null }>((resolve) => {
          resolveSchedule = resolve;
        }),
    );

    const { result } = renderHook(() => useWorkflowLibraryPage());
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    act(() => {
      void result.current.handleToggleSchedule('wf-1', true);
    });

    // Optimistic state should be applied immediately
    await waitFor(() => {
      const wf = result.current.workflows.find((w) => w.id === 'wf-1');
      expect(wf?.isScheduleEnabled).toBe(true);
    });

    // Resolve the API call
    act(() => resolveSchedule({ id: 'wf-1', nextRunAt: null }));
  });

  it('reverts the optimistic update when the API call fails', async () => {
    mocks.serviceUpdateSchedule.mockRejectedValueOnce(
      new Error('network error'),
    );

    const { result } = renderHook(() => useWorkflowLibraryPage());
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    await act(async () => {
      await result.current.handleToggleSchedule('wf-1', true);
    });

    // Should revert to the original isScheduleEnabled value (false)
    const wf = result.current.workflows.find((w) => w.id === 'wf-1');
    expect(wf?.isScheduleEnabled).toBe(false);
    expect(mocks.notificationsError).toHaveBeenCalledWith('network error');
  });

  it('does nothing when toggling a workflow with no schedule', async () => {
    const { result } = renderHook(() => useWorkflowLibraryPage());
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    await act(async () => {
      await result.current.handleToggleSchedule('wf-2', true);
    });

    expect(mocks.serviceUpdateSchedule).not.toHaveBeenCalled();
  });

  it('pauses schedules on canonical system workflows', async () => {
    mocks.serviceList.mockResolvedValueOnce([
      makeWorkflow({
        id: 'system-wf',
        isScheduleEnabled: true,
        metadata: {
          systemWorkflow: buildSystemWorkflowMetadata({
            canonicalId: 'content-loop-autopilot',
          }),
        },
        label: 'Content Loop Autopilot',
        schedule: '0 8 * * *',
        timezone: 'UTC',
      }),
    ]);
    mocks.serviceUpdateSchedule.mockResolvedValueOnce({
      id: 'system-wf',
      isScheduleEnabled: false,
      nextRunAt: null,
      schedule: '0 8 * * *',
      timezone: 'UTC',
    });

    const { result } = renderHook(() => useWorkflowLibraryPage());
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    await act(async () => {
      await result.current.handleToggleSchedule('system-wf', false);
    });

    expect(mocks.serviceUpdateSchedule).toHaveBeenCalledWith('system-wf', {
      isScheduleEnabled: false,
      schedule: '0 8 * * *',
      timezone: 'UTC',
    });
    expect(result.current.workflows[0]?.isScheduleEnabled).toBe(false);
  });

  it('disables schedules for every selected workflow that has a cadence', async () => {
    mocks.serviceList.mockResolvedValueOnce([
      makeWorkflow({
        id: 'wf-1',
        isScheduleEnabled: true,
        label: 'Daily newsletter for FUD News',
        schedule: '0 8 * * *',
        timezone: 'UTC',
      }),
      makeWorkflow({
        id: 'wf-2',
        isScheduleEnabled: true,
        label: 'Daily posts for FUD News',
        schedule: '0 8 * * *',
        timezone: 'UTC',
      }),
    ]);

    const { result } = renderHook(() => useWorkflowLibraryPage());
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    act(() => {
      result.current.toggleSelected('wf-1');
      result.current.toggleSelected('wf-2');
    });

    await act(async () => {
      await result.current.handleDisableSelected();
    });

    expect(mocks.serviceUpdateSchedule).toHaveBeenCalledTimes(2);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('merges a schedule dialog result into the loaded summaries', async () => {
    const { result } = renderHook(() => useWorkflowLibraryPage());
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    act(() => {
      result.current.applyScheduleUpdate({
        id: 'wf-2',
        isScheduleEnabled: true,
        nextRunAt: '2099-01-01T09:00:00.000Z',
        schedule: '0 9 * * *',
        timezone: 'Europe/Paris',
      });
    });

    const wf = result.current.workflows.find((w) => w.id === 'wf-2');
    expect(wf?.schedule).toBe('0 9 * * *');
    expect(wf?.timezone).toBe('Europe/Paris');
    expect(wf?.isScheduleEnabled).toBe(true);
    expect(wf?.nextRunAt).toBe('2099-01-01T09:00:00.000Z');
  });
});

describe('useWorkflowLibraryPage — workflow duplication and deletion', () => {
  beforeEach(() => {
    mocks.serviceList.mockResolvedValue([
      makeWorkflow({
        id: 'wf-1',
        label: 'Editable Workflow',
      }),
    ]);
    mocks.serviceDuplicate.mockResolvedValue({ id: 'wf-copy' });
    mocks.serviceRemove.mockResolvedValue(undefined);
    mocks.getService.mockResolvedValue({
      list: mocks.serviceList,
      duplicate: mocks.serviceDuplicate,
      remove: mocks.serviceRemove,
      updateSchedule: mocks.serviceUpdateSchedule,
    });
  });

  it('routes to the editable duplicated workflow returned by the API', async () => {
    const { result } = renderHook(() => useWorkflowLibraryPage());
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    await act(async () => {
      await result.current.handleDuplicate('wf-1');
    });

    expect(mocks.serviceDuplicate).toHaveBeenCalledWith('wf-1');
    expect(mocks.push).toHaveBeenCalledWith(
      '/org/brand/automate/workflows/wf-copy',
    );
  });

  it('does not delete canonical system workflows from the library', async () => {
    mocks.serviceList.mockResolvedValueOnce([
      makeWorkflow({
        id: 'system-wf',
        metadata: {
          systemWorkflow: buildSystemWorkflowMetadata({
            canonicalId: 'daily-trends-digest',
          }),
        },
        label: 'Daily Trends Digest',
      }),
    ]);

    const { result } = renderHook(() => useWorkflowLibraryPage());
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    await act(async () => {
      await result.current.handleDelete('system-wf');
    });

    expect(mocks.serviceRemove).not.toHaveBeenCalled();
    expect(result.current.workflows).toHaveLength(1);
  });
});
