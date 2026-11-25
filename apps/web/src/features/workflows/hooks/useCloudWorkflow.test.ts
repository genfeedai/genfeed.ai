import { useWorkflowStore } from '@genfeedai/workflows/ui/stores';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloudWorkflowStore } from '@/features/workflows/stores/cloud-workflow-store';
import { useCloudWorkflow } from './useCloudWorkflow';

const mocks = vi.hoisted(() => {
  const service = {
    create: vi.fn().mockResolvedValue({ id: 'wf-created', inputVariables: [] }),
    get: vi.fn(),
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
          id: 'n1',
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
          id: 'n1',
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

  it('keeps and saves an edit made before the /new to /workflows/N handoff commits', async () => {
    const newPage = renderHook(() => useCloudWorkflow());
    await advance(0);
    const addNode = (id: string) =>
      act(() => {
        useWorkflowStore.getState().onNodesChange([
          {
            id,
            type: 'add',
            item: {
              id,
              type: 'prompt',
              position: { x: 0, y: 0 },
              data: {
                prompt: id,
                label: 'Prompt',
                status: 'idle',
                variables: {},
              },
            },
          },
        ]);
      });
    addNode('n1');
    await advance();
    expect(useCloudWorkflowStore.getState().workflowId).toBe('wf-created');

    // Edit lands after the create resolved, before the route commits.
    addNode('n2');
    newPage.unmount();
    renderHook(() => useCloudWorkflow({ workflowId: 'wf-created' }));
    await advance(0);

    expect(mocks.service.get).not.toHaveBeenCalled();
    expect(useWorkflowStore.getState().nodes.map((node) => node.id)).toContain(
      'n2',
    );

    await advance();
    const lastUpdate = mocks.service.update.mock.calls.at(-1);
    expect(lastUpdate?.[0]).toBe('wf-created');
    expect(
      lastUpdate?.[1].nodes.map((node: { id: string }) => node.id),
    ).toContain('n2');
    expect(useWorkflowStore.getState().isDirty).toBe(false);
  });
});
