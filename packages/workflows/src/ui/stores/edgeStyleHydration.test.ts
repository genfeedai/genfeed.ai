import { readFileSync } from 'node:fs';
import type {
  WorkflowEdge,
  WorkflowFile,
  WorkflowNode,
} from '@genfeedai/contracts/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureEdgeStyleMirror,
  getEdgeStylePreference,
  resolveGraphEdgeStyle,
  setEdgeStylePreference,
} from './edgeStyleMirror';
import { configureSettingsSync, useSettingsStore } from './settingsStore';
import type {
  WorkflowData,
  WorkflowPersistenceService,
} from './workflow/types';
import { configureWorkflowPersistence } from './workflow/workflowPersistence';
import { useWorkflowStore } from './workflow/workflowStore';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    clear: () => {
      store = {};
    },
    getItem: (key: string) => store[key] ?? null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
  writable: true,
});

const savedWorkflow: WorkflowData = {
  edgeStyle: 'default',
  edges: [],
  id: 'wf-1',
  label: 'Persisted',
  nodes: [],
};

function makeNode(id: string, type: string): WorkflowNode {
  return { data: {}, id, position: { x: 0, y: 0 }, type } as WorkflowNode;
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

function resetGraph() {
  useWorkflowStore.setState({
    edgeStyle: 'default',
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
}

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

let service: MockedPersistence;

beforeEach(() => {
  localStorage.clear();
  setEdgeStylePreference('default');
  configureEdgeStyleMirror(undefined);
  configureSettingsSync(undefined);
  service = makeService();
  configureWorkflowPersistence(service);
  resetGraph();
});

afterEach(() => {
  configureWorkflowPersistence(undefined);
  configureEdgeStyleMirror(undefined);
  setEdgeStylePreference('default');
});

describe('edgeStyle preference registry', () => {
  it('falls back to default when no preference or record style exists', () => {
    expect(getEdgeStylePreference()).toBe('default');
    expect(resolveGraphEdgeStyle(undefined)).toBe('default');
    expect(resolveGraphEdgeStyle(null)).toBe('default');
    expect(resolveGraphEdgeStyle('')).toBe('default');
  });

  it('uses the preference when the workflow record has no edgeStyle', () => {
    setEdgeStylePreference('straight');
    expect(resolveGraphEdgeStyle(undefined)).toBe('straight');
    expect(resolveGraphEdgeStyle('')).toBe('straight');
  });

  it('lets a saved workflow record win over the preference', () => {
    setEdgeStylePreference('straight');
    expect(resolveGraphEdgeStyle('smoothstep')).toBe('smoothstep');
    expect(resolveGraphEdgeStyle('default')).toBe('default');
  });
});

describe('workflow store init hydration', () => {
  it('hydrates the live graph from a persisted settings preference', async () => {
    vi.resetModules();
    localStorage.setItem(
      'genfeed-settings',
      JSON.stringify({ edgeStyle: 'straight' }),
    );

    const { useWorkflowStore: freshStore } = await import(
      './workflow/workflowStore'
    );

    expect(freshStore.getState().edgeStyle).toBe('straight');
  });

  it('falls back to default when no persisted preference exists', async () => {
    vi.resetModules();
    localStorage.clear();

    const { useWorkflowStore: freshStore } = await import(
      './workflow/workflowStore'
    );

    expect(freshStore.getState().edgeStyle).toBe('default');
  });
});

describe('loadWorkflow / loadWorkflowById precedence', () => {
  it('applies the settings preference when loadWorkflow has no record style', () => {
    setEdgeStylePreference('straight');

    useWorkflowStore.getState().loadWorkflow(
      makeFile({
        edgeStyle: undefined,
        edges: [makeEdge('a', 'b', { type: 'default' })],
        nodes: [makeNode('a', 'prompt'), makeNode('b', 'imageGen')],
      }),
    );

    const state = useWorkflowStore.getState();
    expect(state.edgeStyle).toBe('straight');
    expect(state.edges[0].type).toBe('straight');
  });

  it('keeps a saved graph edgeStyle even when the preference disagrees', () => {
    setEdgeStylePreference('straight');

    useWorkflowStore.getState().loadWorkflow(
      makeFile({
        edgeStyle: 'smoothstep',
        edges: [makeEdge('a', 'b', { type: 'smoothstep' })],
        nodes: [makeNode('a', 'prompt'), makeNode('b', 'imageGen')],
      }),
    );

    const state = useWorkflowStore.getState();
    expect(state.edgeStyle).toBe('smoothstep');
    expect(state.edges[0].type).toBe('smoothstep');
  });

  it('applies the preference from loadWorkflowById when the record has no style', async () => {
    setEdgeStylePreference('smoothstep');
    service.getById.mockResolvedValueOnce({
      ...savedWorkflow,
      edgeStyle: '',
      edges: [makeEdge('a', 'b', { type: 'default' })],
      nodes: [makeNode('a', 'prompt'), makeNode('b', 'imageGen')],
    });

    await useWorkflowStore.getState().loadWorkflowById('wf-1');

    const state = useWorkflowStore.getState();
    expect(state.edgeStyle).toBe('smoothstep');
    expect(state.edges[0].type).toBe('smoothstep');
    expect(state.workflowId).toBe('wf-1');
  });

  it('lets loadWorkflowById keep a saved graph edgeStyle', async () => {
    setEdgeStylePreference('straight');
    service.getById.mockResolvedValueOnce({
      ...savedWorkflow,
      edgeStyle: 'smoothstep',
      edges: [makeEdge('a', 'b', { type: 'smoothstep' })],
      nodes: [makeNode('a', 'prompt'), makeNode('b', 'imageGen')],
    });

    await useWorkflowStore.getState().loadWorkflowById('wf-1');

    const state = useWorkflowStore.getState();
    expect(state.edgeStyle).toBe('smoothstep');
    expect(state.edges[0].type).toBe('smoothstep');
  });
});

describe('save after hydration', () => {
  it('persists the resolved preference so a reload reproduces the same style', async () => {
    setEdgeStylePreference('straight');
    useWorkflowStore.getState().loadWorkflow(
      makeFile({
        edgeStyle: undefined,
        nodes: [makeNode('a', 'prompt')],
      }),
    );

    await useWorkflowStore.getState().saveWorkflow();

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ edgeStyle: 'straight' }),
      undefined,
    );
  });
});

describe('settings preference stays in sync for later loads', () => {
  it('setEdgeStyle records the preference for the next graph without a style', () => {
    useSettingsStore.getState().setEdgeStyle('straight');
    expect(getEdgeStylePreference()).toBe('straight');

    useWorkflowStore.getState().loadWorkflow(
      makeFile({
        edgeStyle: undefined,
      }),
    );
    expect(useWorkflowStore.getState().edgeStyle).toBe('straight');
  });
});

describe('store cycle guard', () => {
  it('does not statically import the settings store from the workflow store', () => {
    const workflowDir = 'src/ui/stores/workflow';
    const sources = [
      readFileSync(`${workflowDir}/workflowStore.ts`, 'utf8'),
      readFileSync(`${workflowDir}/slices/persistenceSlice.ts`, 'utf8'),
      readFileSync(`${workflowDir}/slices/edgeSlice.ts`, 'utf8'),
    ];

    for (const source of sources) {
      expect(source).not.toMatch(/useSettingsStore/);
      expect(source).not.toMatch(/from ['"]\.\.\/settingsStore['"]/);
    }
  });
});
