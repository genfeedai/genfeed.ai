import { useWorkflowStore } from '@genfeedai/workflows/ui/stores';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloudWorkflowStore } from '@/features/workflows/stores/cloud-workflow-store';
import { useCloudWorkflow } from './useCloudWorkflow';

const mocks = vi.hoisted(() => {
  const service = {
    create: vi.fn().mockResolvedValue({ id: 'wf-created', inputVariables: [] }),
    listBrands: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ id: 'wf-created', inputVariables: [] }),
  };
  return { service, getService: vi.fn().mockResolvedValue(service) };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({ brandId: 'brand-1' }),
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ success: vi.fn(), error: vi.fn() }),
  },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

async function advance(ms = 2000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useCloudWorkflow autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('saves a renamed empty draft once nodes are added with dirty already true', async () => {
    renderHook(() => useCloudWorkflow());
    await advance(0);
    act(() => {
      useWorkflowStore.getState().setWorkflowName('Renamed draft');
    });
    await advance();
    expect(mocks.service.create).not.toHaveBeenCalled();
    expect(useWorkflowStore.getState().isDirty).toBe(true);
    act(() => {
      useWorkflowStore.getState().onNodesChange([
        {
          type: 'add',
          item: {
            id: 'n1',
            type: 'prompt',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'draft',
              label: 'Prompt',
              status: 'idle',
              variables: {},
            },
          },
        },
      ]);
    });
    await advance();
    expect(mocks.service.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        brandId: 'brand-1',
        label: 'Renamed draft',
        nodes: [expect.objectContaining({ type: 'workflowInput' })],
      }),
    );
    expect(useWorkflowStore.getState().isDirty).toBe(false);
  });

  it('does not postpone a durable save when transient updates arrive', async () => {
    renderHook(() => useCloudWorkflow());
    await advance(0);
    act(() => {
      useWorkflowStore.getState().onNodesChange([
        {
          type: 'add',
          item: {
            id: 'n1',
            type: 'prompt',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'draft',
              label: 'Prompt',
              status: 'idle',
              variables: {},
            },
          },
        },
      ]);
    });
    await advance(1000);
    act(() => {
      const node = useWorkflowStore.getState().nodes[0];
      useWorkflowStore
        .getState()
        .updateNodeData(node.id, { status: 'processing', progress: 50 });
    });
    await advance(1000);
    expect(mocks.service.create).toHaveBeenCalledTimes(1);
    expect(
      mocks.service.create.mock.calls[0][0].nodes[0].data,
    ).not.toHaveProperty('progress');
    expect(useCloudWorkflowStore.getState().workflowId).toBe('wf-created');
  });
});
