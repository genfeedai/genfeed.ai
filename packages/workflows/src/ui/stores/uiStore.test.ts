import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    notifications: [],
    selectedEdgeId: null,
    selectedNodeId: null,
    showAIGenerator: false,
    showDebugPanel: false,
    showMinimap: true,
    showPalette: true,
  });
});

describe('uiStore — panel toggles', () => {
  it('togglePalette flips the palette', () => {
    useUIStore.getState().togglePalette();
    expect(useUIStore.getState().showPalette).toBe(false);
    useUIStore.getState().togglePalette();
    expect(useUIStore.getState().showPalette).toBe(true);
  });

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

describe('uiStore — notifications', () => {
  it('addNotification assigns an id and stores it', () => {
    vi.useFakeTimers();
    try {
      useUIStore.getState().addNotification({
        title: 'Saved',
        type: 'success',
      });

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].id).toMatch(/^notification-/);
      expect(notifications[0].title).toBe('Saved');
    } finally {
      vi.useRealTimers();
    }
  });

  it('auto-removes after the default duration', () => {
    vi.useFakeTimers();
    try {
      useUIStore.getState().addNotification({ title: 'Bye', type: 'info' });
      expect(useUIStore.getState().notifications).toHaveLength(1);

      vi.advanceTimersByTime(5000);
      expect(useUIStore.getState().notifications).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('duration 0 disables auto-removal', () => {
    vi.useFakeTimers();
    try {
      useUIStore.getState().addNotification({
        duration: 0,
        title: 'Sticky',
        type: 'warning',
      });
      vi.advanceTimersByTime(60000);
      expect(useUIStore.getState().notifications).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('removeNotification removes by id', () => {
    vi.useFakeTimers();
    try {
      useUIStore.getState().addNotification({
        duration: 0,
        title: 'One',
        type: 'error',
      });
      const id = useUIStore.getState().notifications[0].id;
      useUIStore.getState().removeNotification(id);
      expect(useUIStore.getState().notifications).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
