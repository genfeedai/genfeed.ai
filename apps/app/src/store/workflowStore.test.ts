import type {
  PromptNodeData,
  WorkflowEdge,
  WorkflowFile,
  WorkflowNode,
} from '@genfeedai/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workflowsApi } from '@/lib/api';
import { useExecutionStore } from './executionStore';
import { useWorkflowStore } from './workflowStore';

// Mock the API
vi.mock('@/lib/api', () => ({
  workflowsApi: {
    create: vi
      .fn()
      .mockResolvedValue({ _id: 'new-workflow-id', name: 'Test Workflow' }),
    delete: vi.fn().mockResolvedValue({}),
    duplicate: vi
      .fn()
      .mockResolvedValue({ _id: 'duplicate-id', name: 'Workflow (Copy)' }),
    getAll: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue({
      _id: 'workflow-id',
      edgeStyle: 'default',
      edges: [],
      name: 'Loaded Workflow',
      nodes: [],
    }),
    update: vi
      .fn()
      .mockResolvedValue({ _id: 'workflow-id', name: 'Updated Workflow' }),
  },
}));

describe('useWorkflowStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workflowsApi.create).mockResolvedValue({
      _id: 'new-workflow-id',
      name: 'Test Workflow',
    } as never);
    vi.mocked(workflowsApi.delete).mockResolvedValue({} as never);
    vi.mocked(workflowsApi.duplicate).mockResolvedValue({
      _id: 'duplicate-id',
      name: 'Workflow (Copy)',
    } as never);
    vi.mocked(workflowsApi.getAll).mockResolvedValue([]);
    vi.mocked(workflowsApi.getById).mockResolvedValue({
      _id: 'workflow-id',
      edgeStyle: 'default',
      edges: [],
      name: 'Loaded Workflow',
      nodes: [],
    } as never);
    vi.mocked(workflowsApi.update).mockResolvedValue({
      _id: 'workflow-id',
      name: 'Updated Workflow',
    } as never);
    // Reset store to initial state
    useWorkflowStore.setState({
      edgeStyle: 'default',
      edges: [],
      groups: [],
      isDirty: false,
      isLoading: false,
      isSaving: false,
      nodes: [],
      selectedNodeIds: [],
      viewedCommentIds: new Set<string>(),
      workflowId: null,
      workflowName: 'Untitled Workflow',
      workflowTags: [],
    });
    useExecutionStore.getState().setEstimatedCost(0);
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useWorkflowStore.getState();

      expect(state.nodes).toEqual([]);
      expect(state.edges).toEqual([]);
      expect(state.edgeStyle).toBe('default');
      expect(state.workflowName).toBe('Untitled Workflow');
      expect(state.workflowId).toBeNull();
      expect(state.isDirty).toBe(false);
    });
  });

  describe('addNode', () => {
    it('should add a node to the canvas', () => {
      const { addNode } = useWorkflowStore.getState();

      // Use 'prompt' which is a valid NodeType
      const nodeId = addNode('prompt', { x: 100, y: 100 });

      const state = useWorkflowStore.getState();
      expect(nodeId).toBeDefined();
      expect(state.nodes).toHaveLength(1);
      expect(state.nodes[0].type).toBe('prompt');
      expect(state.nodes[0].position).toEqual({ x: 100, y: 100 });
      expect(state.isDirty).toBe(true);
    });

    it('should return empty string for invalid node type', () => {
      const { addNode } = useWorkflowStore.getState();

      // Test with invalid type - using 'never' to bypass type checking
      const nodeId = addNode('invalidNodeType' as never, { x: 0, y: 0 });

      expect(nodeId).toBe('');
      expect(useWorkflowStore.getState().nodes).toHaveLength(0);
    });
  });

  describe('updateNodeData', () => {
    it('should update node data', () => {
      const { addNode, updateNodeData } = useWorkflowStore.getState();
      const nodeId = addNode('prompt', { x: 0, y: 0 });

      updateNodeData(nodeId, { prompt: 'Updated prompt' });

      const state = useWorkflowStore.getState();
      const node = state.nodes.find((n) => n.id === nodeId);
      expect((node?.data as PromptNodeData).prompt).toBe('Updated prompt');
      expect(state.isDirty).toBe(true);
    });
  });

  describe('removeNode', () => {
    it('should remove a node from the canvas', () => {
      const { addNode, removeNode } = useWorkflowStore.getState();
      const nodeId = addNode('prompt', { x: 0, y: 0 });

      removeNode(nodeId);

      const state = useWorkflowStore.getState();
      expect(state.nodes).toHaveLength(0);
      expect(state.isDirty).toBe(true);
    });

    it('should remove connected edges when node is removed', () => {
      const { addNode, removeNode } = useWorkflowStore.getState();
      const node1Id = addNode('prompt', { x: 0, y: 0 });
      const node2Id = addNode('imageGen', { x: 200, y: 0 });

      // Add edge manually
      useWorkflowStore.setState((state) => ({
        edges: [
          ...state.edges,
          {
            id: 'edge-1',
            source: node1Id,
            target: node2Id,
            type: 'bezier',
          } as WorkflowEdge,
        ],
      }));

      removeNode(node1Id);

      const state = useWorkflowStore.getState();
      expect(state.edges).toHaveLength(0);
    });
  });

  describe('duplicateNode', () => {
    it('should duplicate a node', () => {
      const { addNode, duplicateNode } = useWorkflowStore.getState();
      const nodeId = addNode('prompt', { x: 100, y: 100 });

      const newNodeId = duplicateNode(nodeId);

      const state = useWorkflowStore.getState();
      expect(newNodeId).toBeDefined();
      expect(state.nodes).toHaveLength(2);
      // Duplicate should be offset
      const newNode = state.nodes.find((n) => n.id === newNodeId);
      expect(newNode?.position.x).toBe(150);
      expect(newNode?.position.y).toBe(150);
    });

    it('should return null for non-existent node', () => {
      const { duplicateNode } = useWorkflowStore.getState();

      const result = duplicateNode('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('removeEdge', () => {
    it('should remove an edge', () => {
      useWorkflowStore.setState({
        edges: [
          {
            id: 'edge-1',
            source: 'node-1',
            target: 'node-2',
            type: 'bezier',
          } as WorkflowEdge,
        ],
      });

      const { removeEdge } = useWorkflowStore.getState();
      removeEdge('edge-1');

      const state = useWorkflowStore.getState();
      expect(state.edges).toHaveLength(0);
      expect(state.isDirty).toBe(true);
    });
  });

  describe('setEdgeStyle', () => {
    it('should update edge style', () => {
      useWorkflowStore.setState({
        edges: [
          {
            id: 'edge-1',
            source: 'node-1',
            target: 'node-2',
            type: 'bezier',
          } as WorkflowEdge,
          {
            id: 'edge-2',
            source: 'node-2',
            target: 'node-3',
            type: 'bezier',
          } as WorkflowEdge,
        ],
      });

      const { setEdgeStyle } = useWorkflowStore.getState();
      setEdgeStyle('straight');

      const state = useWorkflowStore.getState();
      expect(state.edgeStyle).toBe('straight');
      expect(state.edges.every((e) => e.type === 'straight')).toBe(true);
      expect(state.isDirty).toBe(true);
    });
  });

  describe('loadWorkflow', () => {
    it('should load a workflow file', () => {
      const { loadWorkflow } = useWorkflowStore.getState();

      const workflowFile: WorkflowFile = {
        createdAt: new Date().toISOString(),
        description: '',
        edgeStyle: 'straight',
        edges: [
          {
            id: 'edge-1',
            source: 'node-1',
            target: 'node-2',
            type: 'bezier',
          } as WorkflowEdge,
        ],
        groups: [{ id: 'group-1', nodeIds: ['node-1'] }],
        name: 'Loaded Workflow',
        nodes: [
          {
            data: {
              label: 'Prompt',
              prompt: '',
              status: 'idle',
              variables: {},
            },
            id: 'node-1',
            position: { x: 0, y: 0 },
            type: 'prompt',
          },
          {
            data: {
              label: 'Image',
              model: 'nano-banana',
              status: 'idle',
            },
            id: 'node-2',
            position: { x: 200, y: 0 },
            type: 'imageGen',
          },
        ],
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      loadWorkflow(workflowFile);

      const state = useWorkflowStore.getState();
      expect(state.workflowName).toBe('Loaded Workflow');
      expect(state.nodes).toHaveLength(2);
      expect(state.edgeStyle).toBe('straight');
      expect(state.edges[0].type).toBe('default');
      expect(state.groups).toEqual([{ id: 'group-1', nodeIds: ['node-1'] }]);
      expect(state.workflowId).toBeNull(); // Should reset ID
      expect(state.isDirty).toBe(false);
      expect(useExecutionStore.getState().estimatedCost).toBe(0.039);
    });
  });

  describe('clearWorkflow', () => {
    it('should reset workflow to initial state', () => {
      const { addNode, clearWorkflow } = useWorkflowStore.getState();
      addNode('prompt', { x: 0, y: 0 });

      clearWorkflow();

      const state = useWorkflowStore.getState();
      expect(state.nodes).toHaveLength(0);
      expect(state.edges).toHaveLength(0);
      expect(state.workflowName).toBe('Untitled Workflow');
      expect(state.workflowId).toBeNull();
      expect(state.isDirty).toBe(false);
    });
  });

  describe('exportWorkflow', () => {
    it('should export workflow as WorkflowFile', () => {
      const { addNode, exportWorkflow } = useWorkflowStore.getState();
      addNode('prompt', { x: 0, y: 0 });

      const exported = exportWorkflow();

      expect(exported.version).toBe(1);
      expect(exported.name).toBe('Untitled Workflow');
      expect(exported.nodes).toHaveLength(1);
      expect(exported.createdAt).toBeDefined();
      expect(exported.updatedAt).toBeDefined();
    });
  });

  describe('getNodeById', () => {
    it('should return node by ID', () => {
      const { addNode, getNodeById } = useWorkflowStore.getState();
      const nodeId = addNode('prompt', { x: 0, y: 0 });

      const node = getNodeById(nodeId);

      expect(node).toBeDefined();
      expect(node?.id).toBe(nodeId);
    });

    it('should return undefined for non-existent node', () => {
      const { getNodeById } = useWorkflowStore.getState();

      const node = getNodeById('non-existent');

      expect(node).toBeUndefined();
    });
  });

  describe('validateWorkflow', () => {
    it('should return invalid for empty workflow', () => {
      const { validateWorkflow } = useWorkflowStore.getState();

      const result = validateWorkflow();

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('empty');
    });

    it('should detect missing required inputs', () => {
      const { addNode, validateWorkflow } = useWorkflowStore.getState();
      addNode('imageGen', { x: 0, y: 0 }); // Requires prompt input

      const result = validateWorkflow();

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.message.includes('Missing required input')),
      ).toBe(true);
    });
  });

  describe('setDirty', () => {
    it('should set dirty flag', () => {
      const { setDirty } = useWorkflowStore.getState();

      setDirty(true);
      expect(useWorkflowStore.getState().isDirty).toBe(true);

      setDirty(false);
      expect(useWorkflowStore.getState().isDirty).toBe(false);
    });
  });

  describe('setWorkflowName', () => {
    it('should update workflow name and mark as dirty', () => {
      const { setWorkflowName } = useWorkflowStore.getState();

      setWorkflowName('New Name');

      const state = useWorkflowStore.getState();
      expect(state.workflowName).toBe('New Name');
      expect(state.isDirty).toBe(true);
    });
  });

  describe('API operations', () => {
    describe('saveWorkflow', () => {
      it('should create new workflow when no ID exists', async () => {
        const { addNode, saveWorkflow } = useWorkflowStore.getState();
        addNode('prompt', { x: 0, y: 0 });

        const result = await saveWorkflow();

        expect(result).toBeDefined();
        expect(result._id).toBe('new-workflow-id');
        const state = useWorkflowStore.getState();
        expect(state.workflowId).toBe('new-workflow-id');
        expect(state.isDirty).toBe(false);
        expect(state.isSaving).toBe(false);
      });

      it('should update existing workflow when ID exists', async () => {
        useWorkflowStore.setState({ workflowId: 'existing-id' });
        const { saveWorkflow } = useWorkflowStore.getState();

        await saveWorkflow();

        expect(workflowsApi.update).toHaveBeenCalledWith(
          'existing-id',
          expect.objectContaining({
            name: 'Untitled Workflow',
            tags: [],
          }),
          undefined,
        );
        const state = useWorkflowStore.getState();
        expect(state.isDirty).toBe(false);
      });

      it('should reset saving state and rethrow when save fails', async () => {
        vi.mocked(workflowsApi.create).mockRejectedValueOnce(
          new Error('save failed'),
        );
        const { saveWorkflow } = useWorkflowStore.getState();

        await expect(saveWorkflow()).rejects.toThrow('save failed');

        expect(useWorkflowStore.getState().isSaving).toBe(false);
      });
    });

    describe('loadWorkflowById', () => {
      it('should load workflow from API', async () => {
        vi.mocked(workflowsApi.getById).mockResolvedValueOnce({
          _id: 'workflow-id',
          edgeStyle: 'bezier',
          edges: [
            {
              id: 'edge-1',
              source: 'prompt-1',
              target: 'image-1',
              type: 'bezier',
            },
          ],
          groups: [{ id: 'group-1', nodeIds: ['prompt-1'] }],
          name: 'Loaded Workflow',
          nodes: [
            {
              data: { label: 'Prompt', prompt: 'hello' },
              id: 'prompt-1',
              position: { x: 0, y: 0 },
              type: 'prompt',
            },
            {
              data: { label: 'Image', model: 'nano-banana' },
              id: 'image-1',
              position: { x: 200, y: 0 },
              type: 'imageGen',
            },
          ],
          tags: ['launch'],
        } as never);
        const { loadWorkflowById } = useWorkflowStore.getState();

        await loadWorkflowById('workflow-id');

        const state = useWorkflowStore.getState();
        expect(state.workflowId).toBe('workflow-id');
        expect(state.workflowName).toBe('Loaded Workflow');
        expect(state.workflowTags).toEqual(['launch']);
        expect(state.edges[0].type).toBe('default');
        expect(state.groups).toEqual([
          { id: 'group-1', nodeIds: ['prompt-1'] },
        ]);
        expect(state.isDirty).toBe(false);
        expect(state.isLoading).toBe(false);
        expect(useExecutionStore.getState().estimatedCost).toBe(0.039);
      });

      it('should reset loading state and rethrow when API loading fails', async () => {
        vi.mocked(workflowsApi.getById).mockRejectedValueOnce(
          new Error('load failed'),
        );
        const { loadWorkflowById } = useWorkflowStore.getState();

        await expect(loadWorkflowById('workflow-id')).rejects.toThrow(
          'load failed',
        );

        expect(useWorkflowStore.getState().isLoading).toBe(false);
      });
    });

    describe('deleteWorkflow', () => {
      it('should clear state when deleting current workflow', async () => {
        const { addNode, deleteWorkflow } = useWorkflowStore.getState();
        addNode('prompt', { x: 0, y: 0 });
        useWorkflowStore.setState({ workflowId: 'workflow-to-delete' });

        await deleteWorkflow('workflow-to-delete');

        const state = useWorkflowStore.getState();
        expect(state.nodes).toHaveLength(0);
        expect(state.workflowId).toBeNull();
      });

      it('should not clear state when deleting different workflow', async () => {
        const { addNode, deleteWorkflow } = useWorkflowStore.getState();
        addNode('prompt', { x: 0, y: 0 });
        useWorkflowStore.setState({ workflowId: 'current-workflow' });

        await deleteWorkflow('different-workflow');

        const state = useWorkflowStore.getState();
        expect(state.nodes).toHaveLength(1);
        expect(state.workflowId).toBe('current-workflow');
      });
    });

    it('should create, list, and duplicate workflows through the API helpers', async () => {
      useWorkflowStore.setState({ edgeStyle: 'straight' });
      vi.mocked(workflowsApi.getAll).mockResolvedValueOnce([
        { _id: 'workflow-1', name: 'Workflow 1' },
      ] as never);
      const { createNewWorkflow, duplicateWorkflowApi, listWorkflows } =
        useWorkflowStore.getState();

      await expect(createNewWorkflow()).resolves.toBe('new-workflow-id');
      expect(workflowsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          edgeStyle: 'straight',
          name: 'Untitled Workflow',
        }),
        undefined,
      );
      expect(useWorkflowStore.getState().workflowId).toBe('new-workflow-id');

      await expect(listWorkflows()).resolves.toEqual([
        { _id: 'workflow-1', name: 'Workflow 1' },
      ]);
      expect(workflowsApi.getAll).toHaveBeenCalledWith(undefined, undefined);

      await expect(duplicateWorkflowApi('workflow-1')).resolves.toEqual({
        _id: 'duplicate-id',
        name: 'Workflow (Copy)',
      });
      expect(workflowsApi.duplicate).toHaveBeenCalledWith(
        'workflow-1',
        undefined,
      );
    });
  });

  describe('comments and navigation', () => {
    it('sorts comments, tracks viewed comments, and stores navigation targets', () => {
      const commentedNodes = [
        {
          data: { comment: 'Second row', label: 'B' },
          id: 'b',
          position: { x: 0, y: 100 },
          type: 'prompt',
        },
        {
          data: { comment: 'First row right', label: 'A2' },
          id: 'a2',
          position: { x: 200, y: 0 },
          type: 'prompt',
        },
        {
          data: { comment: 'First row left', label: 'A1' },
          id: 'a1',
          position: { x: 0, y: 20 },
          type: 'prompt',
        },
        {
          data: { comment: '   ', label: 'Empty comment' },
          id: 'empty',
          position: { x: 0, y: 300 },
          type: 'prompt',
        },
      ] as WorkflowNode[];
      useWorkflowStore.setState({ nodes: commentedNodes });
      const {
        getNodesWithComments,
        getUnviewedCommentCount,
        markCommentViewed,
        setNavigationTarget,
      } = useWorkflowStore.getState();

      expect(getNodesWithComments().map((node) => node.id)).toEqual([
        'a1',
        'a2',
        'b',
      ]);
      expect(getUnviewedCommentCount()).toBe(3);

      markCommentViewed('a1');
      expect(useWorkflowStore.getState().viewedCommentIds.has('a1')).toBe(true);
      expect(getUnviewedCommentCount()).toBe(2);

      setNavigationTarget('b');
      expect(useWorkflowStore.getState().navigationTargetId).toBe('b');
      setNavigationTarget(null);
      expect(useWorkflowStore.getState().navigationTargetId).toBeNull();
    });
  });

  describe('connection helpers', () => {
    it('returns connected inputs and upstream node ids', () => {
      useWorkflowStore.setState({
        edges: [
          {
            id: 'edge-1',
            source: 'prompt-1',
            sourceHandle: 'text',
            target: 'image-1',
            targetHandle: 'prompt',
          } as WorkflowEdge,
          {
            id: 'edge-2',
            source: 'image-1',
            sourceHandle: 'output',
            target: 'video-1',
            targetHandle: 'image',
          } as WorkflowEdge,
        ],
        nodes: [
          {
            data: { label: 'Prompt', prompt: 'A prompt' },
            id: 'prompt-1',
            position: { x: 0, y: 0 },
            type: 'prompt',
          },
          {
            data: { label: 'Image' },
            id: 'image-1',
            position: { x: 200, y: 0 },
            type: 'imageGen',
          },
          {
            data: { label: 'Video' },
            id: 'video-1',
            position: { x: 400, y: 0 },
            type: 'videoGen',
          },
        ] as WorkflowNode[],
      });
      const { getConnectedInputs, getConnectedNodeIds } =
        useWorkflowStore.getState();

      expect(getConnectedInputs('image-1').get('prompt')).toBe('A prompt');
      expect(getConnectedNodeIds(['video-1'])).toEqual([
        'video-1',
        'image-1',
        'prompt-1',
      ]);
    });
  });

  describe('validation branches', () => {
    it('detects empty connected source inputs', () => {
      useWorkflowStore.setState({
        edges: [
          {
            id: 'edge-1',
            source: 'prompt-1',
            target: 'image-1',
            targetHandle: 'prompt',
          } as WorkflowEdge,
        ],
        nodes: [
          {
            data: { label: 'Prompt', prompt: '   ' },
            id: 'prompt-1',
            position: { x: 0, y: 0 },
            type: 'prompt',
          },
          {
            data: { label: 'Image' },
            id: 'image-1',
            position: { x: 200, y: 0 },
            type: 'imageGen',
          },
        ] as WorkflowNode[],
      });

      const result = useWorkflowStore.getState().validateWorkflow();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: 'Prompt is empty',
          nodeId: 'prompt-1',
        }),
      );
    });

    it('detects cycles', () => {
      useWorkflowStore.setState({
        edges: [
          { id: 'edge-1', source: 'a', target: 'b' } as WorkflowEdge,
          { id: 'edge-2', source: 'b', target: 'a' } as WorkflowEdge,
        ],
        nodes: [
          {
            data: { label: 'A', prompt: 'a' },
            id: 'a',
            position: { x: 0, y: 0 },
            type: 'prompt',
          },
          {
            data: { label: 'B', prompt: 'b' },
            id: 'b',
            position: { x: 200, y: 0 },
            type: 'prompt',
          },
        ] as WorkflowNode[],
      });

      const result = useWorkflowStore.getState().validateWorkflow();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ message: 'Workflow contains a cycle' }),
      );
    });

    it('validates workflow reference nodes', () => {
      useWorkflowStore.setState({
        edges: [
          { id: 'edge-1', source: 'ref-1', target: 'ref-2' } as WorkflowEdge,
        ],
        nodes: [
          {
            data: { label: 'Broken subworkflow' },
            id: 'ref-1',
            position: { x: 0, y: 0 },
            type: 'workflowRef',
          },
          {
            data: {
              label: 'Stale subworkflow',
              referencedWorkflowId: 'workflow-2',
            },
            id: 'ref-2',
            position: { x: 200, y: 0 },
            type: 'workflowRef',
          },
        ] as WorkflowNode[],
      });

      const result = useWorkflowStore.getState().validateWorkflow();

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: 'Subworkflow node must reference a workflow',
          nodeId: 'ref-1',
        }),
      );
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          message:
            'Subworkflow interface not loaded - refresh to update handles',
          nodeId: 'ref-2',
        }),
      );
    });
  });
});
