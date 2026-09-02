import type {
  WorkflowEdge,
  WorkflowFile,
  WorkflowNode,
} from '@genfeedai/contracts/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowData, WorkflowPersistenceService } from '../types';
import { configureWorkflowPersistence } from '../workflowPersistence';
import { useWorkflowStore } from '../workflowStore';

const savedWorkflow: WorkflowData = {
  edgeStyle: 'default',
  edges: [],
  id: 'wf-1',
  label: 'Persisted',
  nodes: [],
};

interface MockedPersistence extends WorkflowPersistenceService {
  create: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  duplicate: ReturnType<typeof vi.fn>;
  getAll: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

function makeService(): MockedPersistence {
  return {
    create: vi.fn().mockResolvedValue(savedWorkflow),
    delete: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn().mockResolvedValue(savedWorkflow),
    getAll: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(savedWorkflow),
    update: vi.fn().mockResolvedValue(savedWorkflow),
  };
}

function makeNode(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
  position = { x: 0, y: 0 },
): WorkflowNode {
  return { data, id, position, type } as WorkflowNode;
}

function makeEdge(
  source: string,
  target: string,
  overrides: Partial<WorkflowEdge> = {},
): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    ...overrides,
  } as WorkflowEdge;
}

function makeFile(overrides: Partial<WorkflowFile> = {}): WorkflowFile {
  return {
    createdAt: '2026-01-01T00:00:00Z',
    description: '',
    edgeStyle: 'default',
    edges: [],
    groups: [],
    name: 'Loaded',
    nodes: [],
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1,
    ...overrides,
  } as WorkflowFile;
}

let service: MockedPersistence;

beforeEach(() => {
  service = makeService();
  configureWorkflowPersistence(service);
  useWorkflowStore.setState({
    edges: [],
    groups: [],
    isDirty: false,
    isLoading: false,
    isSaving: false,
    navigationTargetId: null,
    nodes: [],
    selectedNodeIds: [],
    viewedCommentIds: new Set<string>(),
    workflowId: null,
    workflowName: 'Untitled Workflow',
  });
});

afterEach(() => {
  configureWorkflowPersistence(undefined);
});

describe('persistenceSlice — local state helpers', () => {
  it('setWorkflowName marks the store dirty', () => {
    useWorkflowStore.getState().setWorkflowName('Renamed');
    expect(useWorkflowStore.getState().workflowName).toBe('Renamed');
    expect(useWorkflowStore.getState().isDirty).toBe(true);
  });

  it('setDirty and setNavigationTarget set plain state', () => {
    useWorkflowStore.getState().setDirty(true);
    expect(useWorkflowStore.getState().isDirty).toBe(true);

    useWorkflowStore.getState().setNavigationTarget('node-1');
    expect(useWorkflowStore.getState().navigationTargetId).toBe('node-1');
    useWorkflowStore.getState().setNavigationTarget(null);
    expect(useWorkflowStore.getState().navigationTargetId).toBeNull();
  });

  it('clearWorkflow resets the graph', () => {
    useWorkflowStore.setState({
      isDirty: true,
      nodes: [makeNode('a', 'prompt')],
      workflowId: 'wf-9',
      workflowName: 'Something',
    });

    useWorkflowStore.getState().clearWorkflow();

    const state = useWorkflowStore.getState();
    expect(state.nodes).toEqual([]);
    expect(state.workflowId).toBeNull();
    expect(state.workflowName).toBe('Untitled Workflow');
    expect(state.isDirty).toBe(false);
  });

  it('getNodeById finds nodes', () => {
    useWorkflowStore.setState({ nodes: [makeNode('a', 'prompt')] });
    expect(useWorkflowStore.getState().getNodeById('a')?.id).toBe('a');
    expect(useWorkflowStore.getState().getNodeById('zz')).toBeUndefined();
  });

  it('exportWorkflow captures graph and metadata', () => {
    useWorkflowStore.setState({
      nodes: [makeNode('a', 'prompt')],
      workflowName: 'Export Me',
    });

    const file = useWorkflowStore.getState().exportWorkflow();
    expect(file.name).toBe('Export Me');
    expect(file.nodes).toHaveLength(1);
    expect(file.version).toBe(1);
  });
});

describe('persistenceSlice — comments', () => {
  it('getNodesWithComments filters and sorts by position', () => {
    useWorkflowStore.setState({
      nodes: [
        makeNode('low', 'prompt', { comment: 'later' }, { x: 0, y: 300 }),
        makeNode('right', 'prompt', { comment: 'second' }, { x: 200, y: 10 }),
        makeNode('left', 'prompt', { comment: 'first' }, { x: 0, y: 0 }),
        makeNode('none', 'prompt', { comment: '   ' }),
        makeNode('empty', 'prompt', {}),
      ],
    });

    const withComments = useWorkflowStore.getState().getNodesWithComments();
    expect(withComments.map((n) => n.id)).toEqual(['left', 'right', 'low']);
  });

  it('counts unviewed comments and marks them viewed', () => {
    useWorkflowStore.setState({
      nodes: [
        makeNode('a', 'prompt', { comment: 'one' }),
        makeNode('b', 'prompt', { comment: 'two' }),
      ],
    });

    expect(useWorkflowStore.getState().getUnviewedCommentCount()).toBe(2);
    useWorkflowStore.getState().markCommentViewed('a');
    expect(useWorkflowStore.getState().getUnviewedCommentCount()).toBe(1);
  });
});

describe('persistenceSlice — loadWorkflow', () => {
  it('hydrates node defaults and normalizes bezier edges', () => {
    const file = makeFile({
      edges: [makeEdge('a', 'b', { type: 'bezier' as WorkflowEdge['type'] })],
      name: 'Loaded Flow',
      nodes: [
        makeNode('a', 'prompt', { prompt: 'hello' }),
        makeNode('b', 'imageGen', {}),
      ],
    });

    useWorkflowStore.getState().loadWorkflow(file);

    const state = useWorkflowStore.getState();
    expect(state.workflowName).toBe('Loaded Flow');
    expect(state.isDirty).toBe(false);
    expect(state.edges[0].type).toBe('default');
    // hydration fills defaults from NODE_DEFINITIONS
    const imageGen = state.getNodeById('b');
    expect(imageGen?.data.model).toBe('nano-banana-pro');
    // loaded data wins over defaults
    const prompt = state.getNodeById('a');
    expect(prompt?.data.prompt).toBe('hello');
  });

  it('keeps unknown node types untouched', () => {
    const file = makeFile({
      nodes: [makeNode('x', 'mystery', { custom: true })],
    });

    useWorkflowStore.getState().loadWorkflow(file);
    expect(useWorkflowStore.getState().getNodeById('x')?.data).toEqual({
      custom: true,
    });
  });
});

describe('persistenceSlice — API operations', () => {
  it('saveWorkflow creates when there is no workflow id', async () => {
    useWorkflowStore.setState({ workflowName: 'Fresh' });

    const result = await useWorkflowStore.getState().saveWorkflow();

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Fresh' }),
      undefined,
    );
    expect(result).toBe(savedWorkflow);
    const state = useWorkflowStore.getState();
    expect(state.workflowId).toBe('wf-1');
    expect(state.isSaving).toBe(false);
    expect(state.isDirty).toBe(false);
  });

  it('saveWorkflow updates when a workflow id exists', async () => {
    useWorkflowStore.setState({ workflowId: 'wf-1' });

    await useWorkflowStore.getState().saveWorkflow();

    expect(service.update).toHaveBeenCalledWith(
      'wf-1',
      expect.anything(),
      undefined,
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('saveWorkflow clears isSaving and rethrows on failure', async () => {
    service.create.mockRejectedValueOnce(new Error('save failed'));

    await expect(useWorkflowStore.getState().saveWorkflow()).rejects.toThrow(
      'save failed',
    );
    expect(useWorkflowStore.getState().isSaving).toBe(false);
  });

  it('createNewWorkflow resets to the created workflow', async () => {
    useWorkflowStore.setState({
      isDirty: true,
      nodes: [makeNode('a', 'prompt')],
    });

    const id = await useWorkflowStore.getState().createNewWorkflow();

    expect(id).toBe('wf-1');
    const state = useWorkflowStore.getState();
    expect(state.nodes).toEqual([]);
    expect(state.workflowId).toBe('wf-1');
    expect(state.workflowName).toBe('Persisted');
    expect(state.isDirty).toBe(false);
  });

  it('loadWorkflowById loads and adopts the persisted id', async () => {
    service.getById.mockResolvedValueOnce({
      ...savedWorkflow,
      nodes: [makeNode('a', 'prompt', { prompt: 'saved' })],
    });

    await useWorkflowStore.getState().loadWorkflowById('wf-1');

    const state = useWorkflowStore.getState();
    expect(state.workflowId).toBe('wf-1');
    expect(state.workflowName).toBe('Persisted');
    expect(state.isLoading).toBe(false);
    expect(state.isDirty).toBe(false);
    expect(state.getNodeById('a')?.data.prompt).toBe('saved');
  });

  it('loadWorkflowById clears isLoading and rethrows on failure', async () => {
    service.getById.mockRejectedValueOnce(new Error('missing'));

    await expect(
      useWorkflowStore.getState().loadWorkflowById('nope'),
    ).rejects.toThrow('missing');
    expect(useWorkflowStore.getState().isLoading).toBe(false);
  });

  it('listWorkflows and duplicateWorkflowApi delegate to the service', async () => {
    await expect(useWorkflowStore.getState().listWorkflows()).resolves.toEqual(
      [],
    );
    await expect(
      useWorkflowStore.getState().duplicateWorkflowApi('wf-1'),
    ).resolves.toBe(savedWorkflow);
    expect(service.getAll).toHaveBeenCalled();
    expect(service.duplicate).toHaveBeenCalledWith('wf-1', undefined);
  });

  it('deleteWorkflow resets state only when deleting the loaded workflow', async () => {
    useWorkflowStore.setState({
      nodes: [makeNode('a', 'prompt')],
      workflowId: 'wf-1',
      workflowName: 'Current',
    });

    await useWorkflowStore.getState().deleteWorkflow('other-id');
    expect(useWorkflowStore.getState().workflowId).toBe('wf-1');

    await useWorkflowStore.getState().deleteWorkflow('wf-1');
    const state = useWorkflowStore.getState();
    expect(state.workflowId).toBeNull();
    expect(state.nodes).toEqual([]);
    expect(state.workflowName).toBe('Untitled Workflow');
  });
});

describe('persistenceSlice — validateWorkflow', () => {
  it('rejects an empty workflow', () => {
    const result = useWorkflowStore.getState().validateWorkflow();
    expect(result.isValid).toBe(false);
    expect(result.errors[0].message).toContain('empty');
  });

  it('rejects multiple nodes with no connections', () => {
    useWorkflowStore.setState({
      nodes: [makeNode('a', 'prompt'), makeNode('b', 'imageGen')],
    });

    const result = useWorkflowStore.getState().validateWorkflow();
    expect(result.isValid).toBe(false);
    expect(result.errors[0].message).toContain('No connections');
  });

  it('reports a missing required input', () => {
    useWorkflowStore.setState({
      edges: [makeEdge('a', 'b', { targetHandle: 'images' })],
      nodes: [
        makeNode('a', 'imageInput', { image: 'data:image/png;base64,x' }),
        makeNode('b', 'imageGen', {}),
      ],
    });

    const result = useWorkflowStore.getState().validateWorkflow();
    expect(result.isValid).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('Missing required input')),
    ).toBe(true);
  });

  it('reports an empty upstream source node', () => {
    useWorkflowStore.setState({
      edges: [makeEdge('a', 'b', { targetHandle: 'prompt' })],
      nodes: [
        makeNode('a', 'prompt', { label: 'Prompt', prompt: '   ' }),
        makeNode('b', 'imageGen', {}),
      ],
    });

    const result = useWorkflowStore.getState().validateWorkflow();
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('is empty'))).toBe(
      true,
    );
  });

  it('accepts a valid prompt-to-image workflow', () => {
    useWorkflowStore.setState({
      edges: [makeEdge('a', 'b', { targetHandle: 'prompt' })],
      nodes: [
        makeNode('a', 'prompt', { prompt: 'a castle' }),
        makeNode('b', 'imageGen', {}),
      ],
    });

    const result = useWorkflowStore.getState().validateWorkflow();
    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('detects cycles', () => {
    useWorkflowStore.setState({
      edges: [
        makeEdge('a', 'b', { targetHandle: 'prompt' }),
        makeEdge('b', 'a'),
      ],
      nodes: [
        makeNode('a', 'prompt', { prompt: 'x' }),
        makeNode('b', 'imageGen', {}),
      ],
    });

    const result = useWorkflowStore.getState().validateWorkflow();
    expect(result.errors.some((e) => e.message.includes('cycle'))).toBe(true);
  });

  it('validates workflowRef nodes', () => {
    useWorkflowStore.setState({
      edges: [makeEdge('a', 'b')],
      nodes: [
        makeNode('a', 'workflowRef', { referencedWorkflowId: null }),
        makeNode('b', 'workflowRef', {
          cachedInterface: null,
          referencedWorkflowId: 'wf-2',
        }),
      ],
    });

    const result = useWorkflowStore.getState().validateWorkflow();
    expect(
      result.errors.some((e) =>
        e.message.includes('must reference a workflow'),
      ),
    ).toBe(true);
    expect(
      result.warnings.some((w) => w.message.includes('interface not loaded')),
    ).toBe(true);
  });
});
