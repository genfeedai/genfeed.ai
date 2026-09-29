import { useUIStore } from '@genfeedai/workflows/ui/stores';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useUIStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset store to initial state
    useUIStore.setState({
      activeModal: null,
      notifications: [],
      selectedEdgeId: null,
      selectedNodeId: null,
      showMinimap: true,
      showPalette: true,
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

      expect(state.showPalette).toBe(true);
      expect(state.showMinimap).toBe(true);
      expect(state.selectedNodeId).toBeNull();
      expect(state.selectedEdgeId).toBeNull();
      expect(state.activeModal).toBeNull();
      expect(state.notifications).toEqual([]);
    });
  });

  describe('togglePalette', () => {
    it('should toggle palette visibility', () => {
      const { togglePalette } = useUIStore.getState();

      togglePalette();
      expect(useUIStore.getState().showPalette).toBe(false);

      togglePalette();
      expect(useUIStore.getState().showPalette).toBe(true);
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
  });

  describe('openModal', () => {
    it('should open the promptLibrary modal', () => {
      const { openModal } = useUIStore.getState();

      openModal('promptLibrary');

      expect(useUIStore.getState().activeModal).toBe('promptLibrary');
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

  describe('addNotification', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should add a notification with generated id', () => {
      const { addNotification } = useUIStore.getState();

      addNotification({
        message: 'This is a test',
        title: 'Test notification',
        type: 'success',
      });

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('success');
      expect(notifications[0].title).toBe('Test notification');
      expect(notifications[0].message).toBe('This is a test');
      expect(notifications[0].id).toMatch(/^notification-\d+$/);
    });

    it('should use custom duration when specified', async () => {
      const { addNotification } = useUIStore.getState();

      addNotification({
        duration: 2000,
        title: 'Custom duration',
        type: 'info',
      });

      expect(useUIStore.getState().notifications).toHaveLength(1);

      vi.advanceTimersByTime(1999);
      expect(useUIStore.getState().notifications).toHaveLength(1);

      vi.advanceTimersByTime(1);
      expect(useUIStore.getState().notifications).toHaveLength(0);
    });

    it('should not auto-remove when duration is 0', async () => {
      const { addNotification } = useUIStore.getState();

      addNotification({
        duration: 0,
        title: 'Persistent',
        type: 'info',
      });

      vi.advanceTimersByTime(10000);

      expect(useUIStore.getState().notifications).toHaveLength(1);
    });
  });

  describe('removeNotification', () => {
    it('should remove a specific notification', () => {
      useUIStore.setState({
        notifications: [
          { id: 'notification-1', title: 'First', type: 'success' },
          { id: 'notification-2', title: 'Second', type: 'error' },
          { id: 'notification-3', title: 'Third', type: 'warning' },
        ],
      });

      const { removeNotification } = useUIStore.getState();
      removeNotification('notification-2');

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(2);
      expect(
        notifications.find((n) => n.id === 'notification-2'),
      ).toBeUndefined();
    });
  });
});
