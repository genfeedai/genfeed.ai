import type { Connection } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkflowStore } from '../workflowStore';

beforeEach(() => {
  useWorkflowStore.setState({
    edgeStyle: 'default',
    edges: [],
    groups: [],
    isDirty: false,
    nodes: [],
    selectedNodeIds: [],
  });
});

function addNode(type: 'prompt' | 'imageGen' | 'videoGen' | 'llm'): string {
  return useWorkflowStore.getState().addNode(type, { x: 0, y: 0 });
}

describe('nodeSlice — addNode', () => {
  it('creates a node with definition defaults', () => {
    const id = addNode('imageGen');
    const node = useWorkflowStore.getState().getNodeById(id);

    expect(node?.type).toBe('imageGen');
    expect(node?.data.label).toBe('Generate Image');
    expect(node?.data.status).toBe('idle');
    expect(useWorkflowStore.getState().isDirty).toBe(true);
  });

  it('returns an empty id for unknown node types', () => {
    type AddNodeType = Parameters<
      ReturnType<typeof useWorkflowStore.getState>['addNode']
    >[0];
    const id = useWorkflowStore
      .getState()
      .addNode('doesNotExist' as AddNodeType, { x: 0, y: 0 });

    expect(id).toBe('');
    expect(useWorkflowStore.getState().nodes).toHaveLength(0);
  });
});

describe('nodeSlice — updateNodeData', () => {
  it('merges data updates', () => {
    const id = addNode('prompt');
    useWorkflowStore.getState().updateNodeData(id, { prompt: 'hello' });

    expect(useWorkflowStore.getState().getNodeById(id)?.data.prompt).toBe(
      'hello',
    );
    expect(useWorkflowStore.getState().isDirty).toBe(true);
  });

  it('transient updates do not mark the store dirty', () => {
    const id = addNode('imageGen');
    useWorkflowStore.setState({ isDirty: false });

    useWorkflowStore.getState().updateNodeData(id, {
      progress: 10,
      status: 'processing',
    });

    expect(useWorkflowStore.getState().isDirty).toBe(false);
  });

  it('propagates prompt text to connected generator inputs', () => {
    const promptId = addNode('prompt');
    const imageId = addNode('imageGen');
    useWorkflowStore.setState((state) => ({
      edges: [
        ...state.edges,
        {
          id: 'e1',
          source: promptId,
          sourceHandle: 'prompt',
          target: imageId,
          targetHandle: 'prompt',
        },
      ],
    }));

    useWorkflowStore.getState().updateNodeData(promptId, { prompt: 'castle' });

    const imageNode = useWorkflowStore.getState().getNodeById(imageId);
    expect(imageNode?.data.inputPrompt).toBe('castle');
  });

  it('propagates explicit output updates downstream', () => {
    const imageId = addNode('imageGen');
    const videoId = addNode('videoGen');
    useWorkflowStore.setState((state) => ({
      edges: [
        ...state.edges,
        {
          id: 'e1',
          source: imageId,
          sourceHandle: 'image',
          target: videoId,
          targetHandle: 'image',
        },
      ],
    }));

    useWorkflowStore.getState().updateNodeData(imageId, {
      outputImage: 'https://cdn/final.png',
    });

    const videoNode = useWorkflowStore.getState().getNodeById(videoId);
    expect(videoNode?.data.inputImage).toBe('https://cdn/final.png');
  });
});

describe('nodeSlice — removeNode and duplicateNode', () => {
  it('removeNode drops the node and its edges', () => {
    const promptId = addNode('prompt');
    const imageId = addNode('imageGen');
    useWorkflowStore.setState((state) => ({
      edges: [
        ...state.edges,
        { id: 'e1', source: promptId, target: imageId, targetHandle: 'prompt' },
      ],
    }));

    useWorkflowStore.getState().removeNode(promptId);

    expect(useWorkflowStore.getState().getNodeById(promptId)).toBeUndefined();
    expect(useWorkflowStore.getState().edges).toHaveLength(0);
  });

  it('duplicateNode clones data, offsets position, and rewires inputs', () => {
    const promptId = addNode('prompt');
    const imageId = addNode('imageGen');
    useWorkflowStore.getState().updateNodeData(promptId, { prompt: 'castle' });
    useWorkflowStore.setState((state) => ({
      edges: [
        ...state.edges,
        {
          id: 'e1',
          source: promptId,
          sourceHandle: 'prompt',
          target: imageId,
          targetHandle: 'prompt',
        },
      ],
    }));

    const cloneId = useWorkflowStore.getState().duplicateNode(imageId);
    expect(cloneId).not.toBeNull();

    const clone = useWorkflowStore.getState().getNodeById(cloneId as string);
    const original = useWorkflowStore.getState().getNodeById(imageId);
    expect(clone?.data.status).toBe('idle');
    expect(clone?.position.x).toBe((original?.position.x ?? 0) + 50);

    const clonedEdge = useWorkflowStore
      .getState()
      .edges.find((edge) => edge.target === cloneId);
    expect(clonedEdge?.source).toBe(promptId);
    // The cloned incoming edge also carried the prompt output over.
    expect(clone?.data.inputPrompt).toBe('castle');
  });

  it('duplicateNode returns null for unknown nodes', () => {
    expect(useWorkflowStore.getState().duplicateNode('missing')).toBeNull();
  });
});

describe('nodeSlice — addNodesAndEdges', () => {
  it('is a no-op for an empty node list', () => {
    useWorkflowStore.getState().addNodesAndEdges([], []);
    expect(useWorkflowStore.getState().isDirty).toBe(false);
  });

  it('appends nodes and edges and propagates outputs', () => {
    const promptId = addNode('prompt');
    useWorkflowStore.getState().updateNodeData(promptId, { prompt: 'castle' });
    const imageNode = {
      data: { inputPrompt: null, label: 'Gen', status: 'idle' },
      id: 'pasted-image',
      position: { x: 100, y: 0 },
      type: 'imageGen',
    };

    useWorkflowStore.getState().addNodesAndEdges(
      [imageNode as never],
      [
        {
          id: 'e-pasted',
          source: promptId,
          sourceHandle: 'prompt',
          target: 'pasted-image',
          targetHandle: 'prompt',
        } as never,
      ],
    );

    const pasted = useWorkflowStore.getState().getNodeById('pasted-image');
    expect(pasted).toBeDefined();
    expect(pasted?.data.inputPrompt).toBe('castle');
  });
});

describe('edgeSlice — connections', () => {
  function connect(
    source: string,
    target: string,
    sourceHandle: string,
    targetHandle: string,
  ): Connection {
    return { source, sourceHandle, target, targetHandle };
  }

  it('isValidConnection accepts text → text and rejects text → image', () => {
    const promptId = addNode('prompt');
    const imageId = addNode('imageGen');

    expect(
      useWorkflowStore
        .getState()
        .isValidConnection(connect(promptId, imageId, 'text', 'prompt')),
    ).toBe(true);
    expect(
      useWorkflowStore
        .getState()
        .isValidConnection(connect(promptId, imageId, 'text', 'images')),
    ).toBe(false);
  });

  it('isValidConnection rejects unknown nodes', () => {
    expect(
      useWorkflowStore
        .getState()
        .isValidConnection(connect('ghost', 'ghost2', 'text', 'prompt')),
    ).toBe(false);
  });

  it('onConnect adds valid edges and ignores invalid ones', () => {
    const promptId = addNode('prompt');
    const imageId = addNode('imageGen');

    useWorkflowStore
      .getState()
      .onConnect(connect(promptId, imageId, 'text', 'images'));
    expect(useWorkflowStore.getState().edges).toHaveLength(0);

    useWorkflowStore
      .getState()
      .onConnect(connect(promptId, imageId, 'text', 'prompt'));
    expect(useWorkflowStore.getState().edges).toHaveLength(1);
    expect(useWorkflowStore.getState().edges[0].type).toBe('default');
  });

  it('onConnect propagates existing source output', () => {
    const promptId = addNode('prompt');
    const imageId = addNode('imageGen');
    useWorkflowStore.getState().updateNodeData(promptId, { prompt: 'castle' });

    useWorkflowStore
      .getState()
      .onConnect(connect(promptId, imageId, 'text', 'prompt'));

    expect(
      useWorkflowStore.getState().getNodeById(imageId)?.data.inputPrompt,
    ).toBe('castle');
  });

  it('findCompatibleHandle picks the first free compatible input', () => {
    const promptId = addNode('prompt');
    const imageId = addNode('imageGen');

    expect(
      useWorkflowStore
        .getState()
        .findCompatibleHandle(promptId, 'text', imageId),
    ).toBe('prompt');
  });

  it('findCompatibleHandle skips occupied single-connection handles', () => {
    const promptA = addNode('prompt');
    const promptB = addNode('prompt');
    const imageId = addNode('imageGen');
    useWorkflowStore
      .getState()
      .onConnect(connect(promptA, imageId, 'text', 'prompt'));

    expect(
      useWorkflowStore
        .getState()
        .findCompatibleHandle(promptB, 'text', imageId),
    ).toBeNull();
  });

  it('findCompatibleHandle returns null for unknown nodes', () => {
    expect(
      useWorkflowStore.getState().findCompatibleHandle('ghost', null, 'ghost'),
    ).toBeNull();
  });
});

describe('edgeSlice — edge maintenance', () => {
  it('removeEdge deletes by id', () => {
    const promptId = addNode('prompt');
    const imageId = addNode('imageGen');
    useWorkflowStore.getState().onConnect({
      source: promptId,
      sourceHandle: 'text',
      target: imageId,
      targetHandle: 'prompt',
    });
    const edgeId = useWorkflowStore.getState().edges[0].id;

    useWorkflowStore.getState().removeEdge(edgeId);
    expect(useWorkflowStore.getState().edges).toHaveLength(0);
  });

  it('setEdgeStyle restyles every edge', () => {
    const promptId = addNode('prompt');
    const imageId = addNode('imageGen');
    useWorkflowStore.getState().onConnect({
      source: promptId,
      sourceHandle: 'text',
      target: imageId,
      targetHandle: 'prompt',
    });

    useWorkflowStore.getState().setEdgeStyle('step');

    expect(useWorkflowStore.getState().edgeStyle).toBe('step');
    expect(useWorkflowStore.getState().edges[0].type).toBe('step');
  });

  it('toggleEdgePause flips the pause flag', () => {
    const promptId = addNode('prompt');
    const imageId = addNode('imageGen');
    useWorkflowStore.getState().onConnect({
      source: promptId,
      sourceHandle: 'text',
      target: imageId,
      targetHandle: 'prompt',
    });
    const edgeId = useWorkflowStore.getState().edges[0].id;

    useWorkflowStore.getState().toggleEdgePause(edgeId);
    expect(useWorkflowStore.getState().edges[0].data?.hasPause).toBe(true);

    useWorkflowStore.getState().toggleEdgePause(edgeId);
    expect(useWorkflowStore.getState().edges[0].data?.hasPause).toBe(false);
  });
});
