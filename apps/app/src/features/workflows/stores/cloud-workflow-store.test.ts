import { WorkflowLifecycle } from '@genfeedai/contracts';
import { useWorkflowStore } from '@genfeedai/workflows/ui/stores';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CloudWorkflowData,
  WorkflowApiService,
} from '../services/workflow-api';
import { useCloudWorkflowStore } from './cloud-workflow-store';

function createService() {
  const create = vi.fn();
  const update = vi.fn();

  return {
    create,
    update,
    service: { create, update } as unknown as WorkflowApiService,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const oneNode = [
  { data: {}, id: 'n1', position: { x: 0, y: 0 }, type: 'prompt' },
];

describe('useCloudWorkflowStore.saveToCloud', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      edgeStyle: 'default',
      edges: [],
      groups: [],
      isDirty: true,
      isSaving: false,
      nodes: [],
      workflowId: null,
      workflowName: 'Sfsfsd',
    });
    useCloudWorkflowStore.setState({
      cloudError: null,
      hasQueuedSave: false,
      inputVariables: [],
      lifecycle: WorkflowLifecycle.DRAFT,
      pendingBrandId: 'brand-shipshit',
      pendingCreateMetadata: null,
      pendingTemplateId: null,
      workflowId: null,
    });
  });

  it('creates with the current brand so the library list can find it', async () => {
    useWorkflowStore.setState({ nodes: oneNode as never });
    const { create, service } = createService();
    create.mockResolvedValue({
      id: 'wf-created',
      inputVariables: [],
      label: 'Sfsfsd',
    });

    await useCloudWorkflowStore.getState().saveToCloud(service);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-shipshit',
        label: 'Sfsfsd',
      }),
    );
    expect(useWorkflowStore.getState().workflowId).toBe('wf-created');
    expect(useCloudWorkflowStore.getState().workflowId).toBe('wf-created');
    expect(useWorkflowStore.getState().isDirty).toBe(false);
  });

  it('does not mark the canvas saved when create returns no id', async () => {
    useWorkflowStore.setState({ nodes: oneNode as never });
    const { create, service } = createService();
    create.mockResolvedValue({
      id: '',
      inputVariables: [],
      label: 'Sfsfsd',
    });

    await expect(
      useCloudWorkflowStore.getState().saveToCloud(service),
    ).rejects.toThrow('Workflow save did not return an id');
    expect(useWorkflowStore.getState().isDirty).toBe(true);
    expect(useWorkflowStore.getState().workflowId).toBeNull();
  });

  it('never creates a workflow that has no nodes and has not been saved yet', async () => {
    // nodes stays [] and workflowId stays null from beforeEach
    const { create, service } = createService();

    await useCloudWorkflowStore.getState().saveToCloud(service);

    expect(create).not.toHaveBeenCalled();
    expect(useWorkflowStore.getState().workflowId).toBeNull();
    expect(useCloudWorkflowStore.getState().workflowId).toBeNull();
  });

  it('still saves an already-saved workflow that has been emptied of nodes', async () => {
    useWorkflowStore.setState({ nodes: [], workflowId: 'wf-existing' });
    useCloudWorkflowStore.setState({ workflowId: 'wf-existing' });
    const { service, update } = createService();
    update.mockResolvedValue({
      id: 'wf-existing',
      inputVariables: [],
      label: 'Sfsfsd',
    });

    await useCloudWorkflowStore.getState().saveToCloud(service);

    expect(update).toHaveBeenCalledWith(
      'wf-existing',
      expect.objectContaining({ nodes: [] }),
    );
    expect(useWorkflowStore.getState().isDirty).toBe(false);
  });

  it('queues a trailing save instead of dropping a request made while one is in flight', async () => {
    useWorkflowStore.setState({ nodes: oneNode as never, workflowId: 'wf-1' });
    useCloudWorkflowStore.setState({ workflowId: 'wf-1' });
    const { service, update } = createService();

    const deferredFirst = createDeferred<CloudWorkflowData>();
    update.mockImplementationOnce(() => deferredFirst.promise);
    update.mockResolvedValueOnce({
      id: 'wf-1',
      inputVariables: [],
      label: 'Sfsfsd',
    });

    const firstSave = useCloudWorkflowStore.getState().saveToCloud(service);

    // A second save request arrives while the first is still in flight —
    // it must be queued as a trailing save, not dropped.
    await useCloudWorkflowStore.getState().saveToCloud(service);

    expect(update).toHaveBeenCalledTimes(1);
    expect(useCloudWorkflowStore.getState().hasQueuedSave).toBe(true);

    deferredFirst.resolve({ id: 'wf-1', inputVariables: [], label: 'Sfsfsd' });
    await firstSave;

    expect(update).toHaveBeenCalledTimes(2);
    expect(useCloudWorkflowStore.getState().hasQueuedSave).toBe(false);
  });

  it('drops the queued-save flag and stays unsaved when a save fails', async () => {
    useWorkflowStore.setState({ nodes: oneNode as never, workflowId: 'wf-1' });
    useCloudWorkflowStore.setState({ workflowId: 'wf-1' });
    const { service, update } = createService();
    update.mockRejectedValue(new Error('network error'));

    await expect(
      useCloudWorkflowStore.getState().saveToCloud(service),
    ).rejects.toThrow('network error');

    expect(useCloudWorkflowStore.getState().hasQueuedSave).toBe(false);
    expect(useCloudWorkflowStore.getState().cloudError).toBe('network error');
    expect(useWorkflowStore.getState().isDirty).toBe(true);
  });
});
