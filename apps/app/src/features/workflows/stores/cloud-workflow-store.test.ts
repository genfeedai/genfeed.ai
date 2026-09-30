import { WorkflowLifecycle } from '@genfeedai/contracts';
import { useWorkflowStore } from '@genfeedai/workflows/ui/stores';
import { logger } from '@services/core/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CloudWorkflowData,
  WorkflowApiService,
} from '../services/workflow-api';
import { useCloudWorkflowStore } from './cloud-workflow-store';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

function createService() {
  const archive = vi.fn();
  const get = vi.fn();
  const listBrands = vi.fn();
  const publish = vi.fn();
  const create = vi.fn();
  const update = vi.fn();

  return {
    archive,
    get,
    listBrands,
    publish,
    create,
    update,
    service: {
      archive,
      get,
      listBrands,
      publish,
      create,
      update,
    } as unknown as WorkflowApiService,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function savedWorkflow(): CloudWorkflowData {
  return {
    id: 'wf-1',
    label: 'Sfsfsd',
    nodes: [],
    edges: [],
    edgeStyle: 'default',
    inputVariables: [],
    lifecycle: WorkflowLifecycle.DRAFT,
    organizationId: 'org-1',
    createdAt: '2026-09-15T00:00:00Z',
    updatedAt: '2026-09-15T00:00:00Z',
  };
}

const oneNode = [
  { data: {}, id: 'n1', position: { x: 0, y: 0 }, type: 'prompt' },
];

describe('useCloudWorkflowStore.saveToCloud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it.each([
    'archiveWorkflow',
    'publishWorkflow',
    'loadFromCloud',
    'loadBrands',
  ] as const)(
    'propagates %s failures without logging in the store',
    async (action) => {
      const error = new Error('Request failed');
      const { service, archive, get, listBrands, publish } = createService();
      for (const request of [archive, get, listBrands, publish])
        request.mockRejectedValue(error);
      useCloudWorkflowStore.setState({
        workflowId: 'wf-1',
        brands: [],
        isBrandsLoading: false,
      });
      const request =
        action === 'loadFromCloud'
          ? useCloudWorkflowStore.getState()[action]('wf-1', service)
          : useCloudWorkflowStore.getState()[action](service);
      await expect(request).rejects.toBe(error);
      expect(logger.error).not.toHaveBeenCalled();
      expect(useCloudWorkflowStore.getState().isBrandsLoading).toBe(false);
      expect(useCloudWorkflowStore.getState().isCloudLoading).toBe(false);
    },
  );

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

  it('coalesces a repeated save request when the durable payload is unchanged', async () => {
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

    // A repeated request waits for settlement, then coalesces if no durable edit arrived.
    await useCloudWorkflowStore.getState().saveToCloud(service);

    expect(update).toHaveBeenCalledTimes(1);
    expect(useCloudWorkflowStore.getState().hasQueuedSave).toBe(true);

    deferredFirst.resolve(savedWorkflow());
    await firstSave;

    expect(update).toHaveBeenCalledTimes(1);
    expect(useCloudWorkflowStore.getState().hasQueuedSave).toBe(false);
  });

  it.each([
    { selected: true },
    { measured: { width: 400, height: 200 }, width: 400, height: 200 },
    {
      data: {
        status: 'running',
        progress: 50,
        error: 'transient',
        jobId: 'job-1',
      },
    },
  ])(
    'does not save transient node changes during a request: %j',
    async (transient) => {
      useWorkflowStore.setState({
        nodes: oneNode as never,
        workflowId: 'wf-1',
      });
      useCloudWorkflowStore.setState({ workflowId: 'wf-1' });
      const { service, update } = createService();
      const pending = createDeferred<CloudWorkflowData>();
      update.mockReturnValueOnce(pending.promise);
      update.mockResolvedValue({ id: 'wf-1', inputVariables: [] });
      const saving = useCloudWorkflowStore.getState().saveToCloud(service);
      useWorkflowStore.setState({
        nodes: [{ ...oneNode[0], ...transient }] as never,
      });
      pending.resolve(savedWorkflow());
      await saving;
      expect(update).toHaveBeenCalledTimes(1);
      expect(useWorkflowStore.getState().isDirty).toBe(false);
    },
  );

  it('strips transient state while preserving real edits in a trailing save', async () => {
    useWorkflowStore.setState({ nodes: oneNode as never, workflowId: 'wf-1' });
    useCloudWorkflowStore.setState({ workflowId: 'wf-1' });
    const { service, update } = createService();
    const pending = createDeferred<CloudWorkflowData>();
    update.mockReturnValueOnce(pending.promise);
    update.mockResolvedValue({ id: 'wf-1', inputVariables: [] });
    const saving = useCloudWorkflowStore.getState().saveToCloud(service);
    useWorkflowStore.setState({
      nodes: [
        {
          ...oneNode[0],
          selected: true,
          measured: { width: 400 },
          data: {
            prompt: 'edited',
            status: 'running',
            progress: 50,
            error: 'transient',
            jobId: 'job-1',
          },
        },
      ] as never,
    });
    pending.resolve(savedWorkflow());
    await saving;
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1][1].nodes).toEqual([
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        type: 'workflowInput',
        data: {
          config: {
            defaultValue: 'edited',
            inputName: 'n1',
            inputType: 'text',
            required: false,
          },
          label: 'text input',
        },
      },
    ]);
  });

  it('ignores edge selection but saves concurrent edge style and input defaults', async () => {
    useWorkflowStore.setState({
      nodes: oneNode as never,
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }] as never,
      workflowId: 'wf-1',
    });
    useCloudWorkflowStore.setState({ workflowId: 'wf-1' });
    const { service, update } = createService();
    const pending = createDeferred<CloudWorkflowData>();
    update.mockReturnValueOnce(pending.promise);
    update.mockResolvedValue({
      id: 'wf-1',
      inputVariables: [
        { key: 'prompt', label: 'Prompt', type: 'text', defaultValue: 'new' },
      ],
    });
    const saving = useCloudWorkflowStore.getState().saveToCloud(service);
    useWorkflowStore.setState({
      edgeStyle: 'straight',
      edges: [
        { id: 'e1', source: 'n1', target: 'n2', selected: true },
      ] as never,
    });
    useCloudWorkflowStore.setState({
      inputVariables: [
        { key: 'prompt', label: 'Prompt', type: 'text', defaultValue: 'new' },
      ],
    });
    pending.resolve(savedWorkflow());
    await saving;
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1][1]).toMatchObject({
      edgeStyle: 'straight',
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      inputVariables: [{ key: 'prompt', defaultValue: 'new' }],
    });
    expect(update.mock.calls[1][1].edges[0]).not.toHaveProperty('selected');
    expect(
      useCloudWorkflowStore.getState().inputVariables[0].defaultValue,
    ).toBe('new');
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
    expect(logger.error).not.toHaveBeenCalled();
    expect(useWorkflowStore.getState().isDirty).toBe(true);
  });

  it('does not report an edit made during the request as saved, and persists it via a trailing save', async () => {
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

    // An edit lands while the first request is still in flight — a new
    // array reference, exactly like a real node mutation would produce.
    const editedNodes = [
      ...oneNode,
      { data: {}, id: 'n2', position: { x: 100, y: 0 }, type: 'prompt' },
    ];
    useWorkflowStore.setState({ nodes: editedNodes as never });

    deferredFirst.resolve(savedWorkflow());
    await firstSave;

    // The first request's payload predates the edit, so the canvas must
    // not be reported as saved — a trailing save with the new nodes runs
    // automatically instead of silently dropping the edit.
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith(
      'wf-1',
      expect.objectContaining({
        nodes: expect.arrayContaining([expect.objectContaining({ id: 'n2' })]),
      }),
    );
    expect(useWorkflowStore.getState().isDirty).toBe(false);
    expect(useCloudWorkflowStore.getState().hasQueuedSave).toBe(false);
  });
});

describe('useCloudWorkflowStore.scheduleAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWorkflowStore.setState({
      edgeStyle: 'default',
      edges: [],
      groups: [],
      isDirty: true,
      isSaving: false,
      nodes: oneNode as never,
      workflowId: 'wf-1',
      workflowName: 'Sfsfsd',
    });
    useCloudWorkflowStore.setState({
      autoSaveTimeoutId: null,
      cloudError: null,
      hasQueuedSave: false,
      inputVariables: [],
      lifecycle: WorkflowLifecycle.DRAFT,
      pendingBrandId: 'brand-shipshit',
      pendingCreateMetadata: null,
      pendingTemplateId: null,
      workflowId: 'wf-1',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('queues a trailing save instead of dropping a request while a save is already in flight', () => {
    useWorkflowStore.setState({ isSaving: true });
    const { service } = createService();

    useCloudWorkflowStore.getState().scheduleAutoSave(service, vi.fn());

    expect(useCloudWorkflowStore.getState().hasQueuedSave).toBe(true);
    // No debounce timer should be scheduled while a save is already running.
    expect(useCloudWorkflowStore.getState().autoSaveTimeoutId).toBeNull();
  });
  it('hands an autosave failure to its UI error callback once', async () => {
    const error = new Error('Autosave failed');
    const { service, update } = createService();
    update.mockRejectedValue(error);
    const onError = vi.fn();
    useCloudWorkflowStore.getState().scheduleAutoSave(service, onError);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(logger.error).not.toHaveBeenCalled();
    expect(useCloudWorkflowStore.getState().cloudError).toBe('Autosave failed');
  });
});
