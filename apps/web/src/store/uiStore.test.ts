import { useUIStore } from '@genfeedai/workflows/ui/stores';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useUIStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset store to initial state
    useUIStore.setState({
      activeModal: null,
      selectedEdgeId: null,
      selectedNodeId: null,
      showMinimap: true,
    });
  });

  afterEach(() => {
    try {
      vi.clearAllTimers();
    } catch {
      // Ignore if fake timers aren't active
    }
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useUIStore.getState();

      expect(state.showMinimap).toBe(true);
      expect(state.selectedNodeId).toBeNull();
      expect(state.selectedEdgeId).toBeNull();
      expect(state.activeModal).toBeNull();
    });
  });

  describe('toggleMinimap', () => {
    it('should toggle minimap visibility', () => {
      const { toggleMinimap } = useUIStore.getState();

      toggleMinimap();
      expect(useUIStore.getState().showMinimap).toBe(false);

      toggleMinimap();
      expect(useUIStore.getState().showMinimap).toBe(true);
    });
  });

  describe('selectNode', () => {
    it('should select a node and clear edge selection', () => {
      useUIStore.setState({ selectedEdgeId: 'edge-1' });
      const { selectNode } = useUIStore.getState();

      selectNode('node-1');

      const state = useUIStore.getState();
      expect(state.selectedNodeId).toBe('node-1');
      expect(state.selectedEdgeId).toBeNull();
    });

    it('should clear node selection when passed null', () => {
      useUIStore.setState({ selectedNodeId: 'node-1' });
      const { selectNode } = useUIStore.getState();

      selectNode(null);

      expect(useUIStore.getState().selectedNodeId).toBeNull();
    });
  });

  describe('selectEdge', () => {
    it('should select an edge and clear node selection', () => {
      useUIStore.setState({ selectedNodeId: 'node-1' });
      const { selectEdge } = useUIStore.getState();

      selectEdge('edge-1');

      const state = useUIStore.getState();
      expect(state.selectedEdgeId).toBe('edge-1');
      expect(state.selectedNodeId).toBeNull();
    });

    it('should clear edge selection when passed null', () => {
      useUIStore.setState({ selectedEdgeId: 'edge-1' });
      const { selectEdge } = useUIStore.getState();

      selectEdge(null);

      expect(useUIStore.getState().selectedEdgeId).toBeNull();
    });
  });

  describe('openModal', () => {
    it('should open the templates modal', () => {
      const { openModal } = useUIStore.getState();

      openModal('templates');

      expect(useUIStore.getState().activeModal).toBe('templates');
    });

    it('should open the cost modal', () => {
      const { openModal } = useUIStore.getState();

      openModal('cost');

      expect(useUIStore.getState().activeModal).toBe('cost');
    });

    it('should open the welcome modal', () => {
      const { openModal } = useUIStore.getState();

      openModal('welcome');

      expect(useUIStore.getState().activeModal).toBe('welcome');
    });

    it('should open the settings modal', () => {
      const { openModal } = useUIStore.getState();

      openModal('settings');

      expect(useUIStore.getState().activeModal).toBe('settings');
    });
  });

  describe('closeModal', () => {
    it('should close any open modal', () => {
      useUIStore.setState({ activeModal: 'templates' });
      const { closeModal } = useUIStore.getState();

      closeModal();

      expect(useUIStore.getState().activeModal).toBeNull();
    });
  });
});
