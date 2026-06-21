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
  serviceSetSchedule: vi.fn(),
  getService: vi.fn(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('next/navigation', () => ({
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

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const makeWorkflow = (
  overrides: Partial<WorkflowSummary> = {},
): WorkflowSummary => ({
  _id: 'wf-1',
  name: 'Test Workflow',
  lifecycle: 'published',
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
        _id: 'wf-1',
        name: 'Scheduled Workflow',
        schedule: '0 9 * * 1',
        timezone: 'UTC',
        isScheduleEnabled: false,
      }),
      makeWorkflow({
        _id: 'wf-2',
        name: 'Unscheduled Workflow',
      }),
    ]);
    mocks.serviceSetSchedule.mockResolvedValue(undefined);
    mocks.getService.mockResolvedValue({
      list: mocks.serviceList,
      duplicate: mocks.serviceDuplicate,
      remove: mocks.serviceRemove,
      setSchedule: mocks.serviceSetSchedule,
    });
  });

  it('calls setSchedule with enabled=true when toggling on a workflow that has a schedule', async () => {
    const { result } = renderHook(() => useWorkflowLibraryPage());

    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    await act(async () => {
      await result.current.handleToggleSchedule('wf-1', true);
    });

    expect(mocks.serviceSetSchedule).toHaveBeenCalledWith('wf-1', {
      enabled: true,
      schedule: '0 9 * * 1',
      timezone: 'UTC',
    });
  });

  it('applies an optimistic update before the API resolves', async () => {
    let resolveSchedule!: () => void;
    mocks.serviceSetSchedule.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
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
      const wf = result.current.workflows.find((w) => w._id === 'wf-1');
      expect(wf?.isScheduleEnabled).toBe(true);
    });

    // Resolve the API call
    act(() => resolveSchedule());
  });

  it('reverts the optimistic update when the API call fails', async () => {
    mocks.serviceSetSchedule.mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useWorkflowLibraryPage());
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    await act(async () => {
      await result.current.handleToggleSchedule('wf-1', true);
    });

    // Should revert to the original isScheduleEnabled value (false)
    const wf = result.current.workflows.find((w) => w._id === 'wf-1');
    expect(wf?.isScheduleEnabled).toBe(false);
  });

  it('does nothing when toggling a workflow with no schedule', async () => {
    const { result } = renderHook(() => useWorkflowLibraryPage());
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    await act(async () => {
      await result.current.handleToggleSchedule('wf-2', true);
    });

    expect(mocks.serviceSetSchedule).not.toHaveBeenCalled();
  });
});
