import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from './uiStore';

const INITIAL_STATE = useUIStore.getState();

beforeEach(() => {
  useUIStore.setState(INITIAL_STATE, true);
  useUIStore.setState({
    activeModal: null,
    connectionDropMenu: null,
    highlightedNodeIds: [],
    nodeDetailActiveTab: 'preview',
    nodeDetailNodeId: null,
    nodeDetailStartIndex: 0,
    selectedEdgeId: null,
    selectedNodeId: null,
    showAIGenerator: false,
    showDebugPanel: false,
    showMinimap: true,
  });
});

describe('uiStore — panel toggles', () => {
  it('toggleMinimap flips the minimap', () => {
    useUIStore.getState().toggleMinimap();
    expect(useUIStore.getState().showMinimap).toBe(false);
  });

  it('toggleAIGenerator flips the AI generator', () => {
    useUIStore.getState().toggleAIGenerator();
    expect(useUIStore.getState().showAIGenerator).toBe(true);
  });

  it('toggleDebugPanel and setShowDebugPanel control the debug panel', () => {
    useUIStore.getState().toggleDebugPanel();
    expect(useUIStore.getState().showDebugPanel).toBe(true);
    useUIStore.getState().setShowDebugPanel(false);
    expect(useUIStore.getState().showDebugPanel).toBe(false);
  });
});

describe('uiStore — selection', () => {
  it('selectNode clears any edge selection', () => {
    useUIStore.getState().selectEdge('edge-1');
    useUIStore.getState().selectNode('node-1');

    const state = useUIStore.getState();
    expect(state.selectedNodeId).toBe('node-1');
    expect(state.selectedEdgeId).toBeNull();
  });

  it('selectEdge clears any node selection', () => {
    useUIStore.getState().selectNode('node-1');
    useUIStore.getState().selectEdge('edge-1');

    const state = useUIStore.getState();
    expect(state.selectedEdgeId).toBe('edge-1');
    expect(state.selectedNodeId).toBeNull();
  });

  it('setHighlightedNodeIds replaces the highlight set', () => {
    useUIStore.getState().setHighlightedNodeIds(['a', 'b']);
    expect(useUIStore.getState().highlightedNodeIds).toEqual(['a', 'b']);
  });
});

describe('uiStore — modals', () => {
  it('openModal and closeModal set activeModal', () => {
    useUIStore.getState().openModal('settings');
    expect(useUIStore.getState().activeModal).toBe('settings');
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('openNodeDetailModal defaults to the preview tab', () => {
    useUIStore.getState().openNodeDetailModal('node-1');

    const state = useUIStore.getState();
    expect(state.activeModal).toBe('nodeDetail');
    expect(state.nodeDetailNodeId).toBe('node-1');
    expect(state.nodeDetailActiveTab).toBe('preview');
    expect(state.nodeDetailStartIndex).toBe(0);
  });

  it('openNodeDetailModal accepts tab and start index', () => {
    useUIStore.getState().openNodeDetailModal('node-1', 'history', 3);

    const state = useUIStore.getState();
    expect(state.nodeDetailActiveTab).toBe('history');
    expect(state.nodeDetailStartIndex).toBe(3);
  });

  it('setNodeDetailTab switches tabs', () => {
    useUIStore.getState().openNodeDetailModal('node-1');
    useUIStore.getState().setNodeDetailTab('history');
    expect(useUIStore.getState().nodeDetailActiveTab).toBe('history');
  });

  it('closeNodeDetailModal resets the detail state', () => {
    useUIStore.getState().openNodeDetailModal('node-1', 'history', 2);
    useUIStore.getState().closeNodeDetailModal();

    const state = useUIStore.getState();
    expect(state.activeModal).toBeNull();
    expect(state.nodeDetailNodeId).toBeNull();
    expect(state.nodeDetailActiveTab).toBe('preview');
    expect(state.nodeDetailStartIndex).toBe(0);
  });
});

describe('uiStore — connection drop menu', () => {
  it('opens and closes the menu', () => {
    const params = {
      position: { x: 10, y: 20 },
      screenPosition: { x: 100, y: 200 },
      sourceHandleId: 'out',
      sourceHandleType: 'image' as const,
      sourceNodeId: 'node-1',
    };
    useUIStore.getState().openConnectionDropMenu(params);
    expect(useUIStore.getState().connectionDropMenu).toEqual(params);

    useUIStore.getState().closeConnectionDropMenu();
    expect(useUIStore.getState().connectionDropMenu).toBeNull();
  });
});
