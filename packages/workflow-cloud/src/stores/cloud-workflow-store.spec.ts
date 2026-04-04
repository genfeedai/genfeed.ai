import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerWarn = vi.hoisted(() => vi.fn());
const loadWorkflow = vi.hoisted(() => vi.fn());
const setWorkflowStoreState = vi.hoisted(() => vi.fn());

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    warn: loggerWarn,
  },
}));

vi.mock('@genfeedai/workflow-ui/stores', () => ({
  useWorkflowStore: {
    getState: () => ({
      loadWorkflow,
    }),
    setState: setWorkflowStoreState,
  },
}));

vi.mock('@workflow-cloud/nodes/merged-node-types', () => ({
  cloudNodeTypes: {
    brand: {},
    captionGen: {},
  },
}));

describe('cloud workflow store hydration', () => {
  beforeEach(() => {
    vi.resetModules();
    loadWorkflow.mockReset();
    loggerWarn.mockReset();
    setWorkflowStoreState.mockReset();
  });

  it('repairs invalid node ids before loading them into the shared workflow store', async () => {
    const { useCloudWorkflowStore } = await import('./cloud-workflow-store');

    await useCloudWorkflowStore.getState().loadFromCloud('workflow-123', {
      get: vi.fn().mockResolvedValue({
        _id: 'workflow-123',
        createdAt: '2026-03-24T00:00:00.000Z',
        edgeStyle: 'default',
        edges: [],
        groups: [],
        lifecycle: 'draft',
        name: 'Recovered Workflow',
        nodes: [
          {
            id: 'brand-node',
            position: { x: 0, y: 0 },
            type: 'brand',
          },
          {
            id: 'brand-node',
            position: { x: 24, y: 48 },
            type: 'brand',
          },
          {
            id: '',
            position: { x: 12, y: 18 },
            type: 'captionGen',
          },
        ],
        organization: 'org-123',
        updatedAt: '2026-03-24T00:00:00.000Z',
      }),
    } as never);

    expect(loadWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [
          expect.objectContaining({ id: 'brand-node', type: 'brand' }),
          expect.objectContaining({ id: 'brand-node-2', type: 'brand' }),
          expect.objectContaining({ id: 'captionGen-3', type: 'captionGen' }),
        ],
      }),
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      'Cloud workflow repaired invalid node ids during load',
      expect.objectContaining({
        repairedNodes: [
          expect.objectContaining({
            kind: 'duplicate-id',
            nextId: 'brand-node-2',
            originalId: 'brand-node',
          }),
          expect.objectContaining({
            kind: 'missing-id',
            nextId: 'captionGen-3',
            originalId: null,
          }),
        ],
        reportToSentry: false,
        workflowId: 'workflow-123',
      }),
    );
  });

  it('drops malformed unknown nodes before hydrating the shared store', async () => {
    const { useCloudWorkflowStore } = await import('./cloud-workflow-store');

    await useCloudWorkflowStore.getState().loadFromCloud('workflow-999', {
      get: vi.fn().mockResolvedValue({
        _id: 'workflow-999',
        createdAt: '2026-03-24T00:00:00.000Z',
        edgeStyle: 'default',
        edges: [],
        groups: [],
        lifecycle: 'draft',
        name: 'Broken Workflow',
        nodes: [
          {
            id: 'bad-node',
            position: { x: 0, y: 0 },
            type: 'unknown',
          },
        ],
        organization: 'org-123',
        updatedAt: '2026-03-24T00:00:00.000Z',
      }),
    } as never);

    expect(loadWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [],
      }),
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      'Cloud workflow repaired invalid node ids during load',
      expect.objectContaining({
        repairedNodes: [
          expect.objectContaining({
            kind: 'dropped-malformed-node',
            nextId: null,
            originalId: 'bad-node',
            type: 'unknown',
          }),
        ],
        workflowId: 'workflow-999',
      }),
    );
  });
});
