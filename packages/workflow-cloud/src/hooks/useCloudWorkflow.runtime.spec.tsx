import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloudWorkflow } from './useCloudWorkflow';

const stores = vi.hoisted(() => ({
  clearWorkflow: vi.fn(),
  selectIsDirty: vi.fn(),
  selectIsSaving: vi.fn(),
  sharedState: {
    clearWorkflow: vi.fn(),
    edgeStyle: 'default',
    edges: [] as unknown[],
    groups: [] as unknown[],
    isDirty: false,
    isSaving: false,
    nodes: [] as unknown[],
    saveWorkflow: vi.fn(),
    workflowId: null as string | null,
    workflowName: 'Workflow',
  },
  useWorkflowStore: vi.fn(),
}));

const cloudStore = vi.hoisted(() => ({
  archiveWorkflow: vi.fn(),
  cancelAutoSave: vi.fn(),
  listeners: new Set<() => void>(),
  loadBrands: vi.fn().mockResolvedValue(undefined),
  loadFromCloud: vi.fn().mockResolvedValue(undefined),
  notify() {
    cloudStore.snapshot = buildCloudSnapshot();

    for (const listener of cloudStore.listeners) {
      listener();
    }
  },
  publishWorkflow: vi.fn(),
  resetCloudState: vi.fn(),
  saveToCloud: vi.fn(),
  scheduleAutoSave: vi.fn(),
  setPendingTemplateCreate: vi.fn(),
  snapshot: null as Record<string, unknown> | null,
  state: {
    brands: [] as unknown[],
    cloudError: null as string | null,
    isBrandsLoading: false,
    isCloudLoading: false,
    isHydrated: false,
    lifecycle: 'draft' as const,
  },
}));

function buildCloudSnapshot() {
  return {
    ...cloudStore.state,
    archiveWorkflow: cloudStore.archiveWorkflow,
    cancelAutoSave: cloudStore.cancelAutoSave,
    loadBrands: cloudStore.loadBrands,
    loadFromCloud: cloudStore.loadFromCloud,
    publishWorkflow: cloudStore.publishWorkflow,
    resetCloudState: cloudStore.resetCloudState,
    saveToCloud: cloudStore.saveToCloud,
    scheduleAutoSave: cloudStore.scheduleAutoSave,
    setHydrated: (isHydrated: boolean) => {
      cloudStore.state.isHydrated = isHydrated;
      cloudStore.notify();
    },
    setPendingTemplateCreate: cloudStore.setPendingTemplateCreate,
  };
}

cloudStore.snapshot = buildCloudSnapshot();

const authMocks = vi.hoisted(() => ({
  getService: vi.fn().mockResolvedValue({
    listBrands: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('@genfeedai/workflow-ui/stores', () => ({
  selectIsDirty: stores.selectIsDirty,
  selectIsSaving: stores.selectIsSaving,
  useWorkflowStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      return selector ? selector(stores.sharedState) : stores.sharedState;
    },
    {
      getState: () => stores.sharedState,
      setState: (partial: Record<string, unknown>) => {
        Object.assign(stores.sharedState, partial);
      },
    },
  ),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => authMocks.getService),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@workflow-cloud/services/workflow-api', () => ({
  createWorkflowApiService: vi.fn(),
}));

vi.mock('@workflow-cloud/stores/cloud-workflow-store', () => ({
  useCloudWorkflowStore: Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const snapshot = useSyncExternalStore(
        (listener) => {
          cloudStore.listeners.add(listener);
          return () => cloudStore.listeners.delete(listener);
        },
        () => cloudStore.snapshot ?? buildCloudSnapshot(),
        () => cloudStore.snapshot ?? buildCloudSnapshot(),
      );

      return selector ? selector(snapshot) : snapshot;
    },
    {
      getState: () => ({
        ...(cloudStore.snapshot ?? buildCloudSnapshot()),
        archiveWorkflow: cloudStore.archiveWorkflow,
        cancelAutoSave: cloudStore.cancelAutoSave,
        loadBrands: cloudStore.loadBrands,
        loadFromCloud: cloudStore.loadFromCloud,
        publishWorkflow: cloudStore.publishWorkflow,
        resetCloudState: () => {
          cloudStore.state.isHydrated = false;
          cloudStore.resetCloudState();
          cloudStore.notify();
        },
        saveToCloud: cloudStore.saveToCloud,
        scheduleAutoSave: cloudStore.scheduleAutoSave,
        setHydrated: (isHydrated: boolean) => {
          cloudStore.state.isHydrated = isHydrated;
          cloudStore.notify();
        },
        setPendingTemplateCreate: cloudStore.setPendingTemplateCreate,
      }),
    },
  ),
}));

function HookConsumer() {
  const { isLoading } = useCloudWorkflow({ workflowId: 'workflow-123' });

  return <div data-testid="loading-state">{String(isLoading)}</div>;
}

describe('useCloudWorkflow hydration gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stores.sharedState.clearWorkflow = stores.clearWorkflow;
    stores.sharedState.edgeStyle = 'default';
    stores.sharedState.edges = [];
    stores.sharedState.groups = [];
    stores.sharedState.isDirty = false;
    stores.sharedState.isSaving = false;
    stores.sharedState.nodes = [];
    stores.sharedState.saveWorkflow = vi.fn();
    stores.sharedState.workflowId = null;
    stores.sharedState.workflowName = 'Workflow';
    authMocks.getService.mockResolvedValue({
      listBrands: vi.fn().mockResolvedValue([]),
    });
    cloudStore.state.brands = [];
    cloudStore.state.cloudError = null;
    cloudStore.state.isBrandsLoading = false;
    cloudStore.state.isCloudLoading = false;
    cloudStore.state.isHydrated = false;
    cloudStore.notify();
  });

  it('reports loading on the initial render before async hydration finishes', () => {
    render(<HookConsumer />);

    expect(screen.getByTestId('loading-state').textContent).toBe('true');
  });

  it('eventually clears loading after hydration', async () => {
    render(<HookConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('loading-state').textContent).toBe('false');
    });

    expect(stores.clearWorkflow).toHaveBeenCalled();
  });

  it('clears loading in StrictMode after the double-invocation mount cycle', async () => {
    render(
      <StrictMode>
        <HookConsumer />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading-state').textContent).toBe('false');
    });
  });

  it('does not retry brands loading forever after an initial failure', async () => {
    cloudStore.loadBrands.mockRejectedValueOnce(new Error('brands failed'));

    render(<HookConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('loading-state').textContent).toBe('false');
    });

    await waitFor(() => {
      expect(cloudStore.loadBrands).toHaveBeenCalledTimes(1);
    });
  });

  it('rebinds the shared workflow save action to cloud persistence', async () => {
    render(<HookConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('loading-state').textContent).toBe('false');
    });

    await stores.sharedState.saveWorkflow();

    expect(cloudStore.saveToCloud).toHaveBeenCalledTimes(1);
  });
});
