import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@genfeedai/workflow-ui/stores';

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

    it('should add multiple notifications', () => {
      const { addNotification } = useUIStore.getState();

      addNotification({ title: 'First', type: 'success' });
      addNotification({ title: 'Second', type: 'error' });
      addNotification({ title: 'Third', type: 'warning' });

      const notifications = useUIStore.getState().notifications;
      expect(notifications).toHaveLength(3);
    });

    it('should auto-remove notification after default duration', async () => {
      const { addNotification } = useUIStore.getState();

      addNotification({ title: 'Auto-remove test', type: 'info' });

      expect(useUIStore.getState().notifications).toHaveLength(1);

      // Fast-forward 5 seconds (default duration)
      vi.advanceTimersByTime(5000);

      expect(useUIStore.getState().notifications).toHaveLength(0);
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
      expect(notifications.find((n) => n.id === 'notification-2')).toBeUndefined();
    });

    it('should do nothing for non-existent notification', () => {
      useUIStore.setState({
        notifications: [{ id: 'notification-1', title: 'First', type: 'success' }],
      });

      const { removeNotification } = useUIStore.getState();
      removeNotification('non-existent');

      expect(useUIStore.getState().notifications).toHaveLength(1);
    });
  });
});
