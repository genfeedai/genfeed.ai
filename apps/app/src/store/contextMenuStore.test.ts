import { beforeEach, describe, expect, it } from 'vitest';
import { useContextMenuStore } from './contextMenuStore';

describe('contextMenuStore', () => {
  beforeEach(() => {
    // Reset store state (don't replace methods)
    const store = useContextMenuStore;
    store.setState({
      isOpen: false,
      menuType: null,
      position: { x: 0, y: 0 },
      targetId: null,
      targetIds: null,
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useContextMenuStore.getState();

      expect(state.isOpen).toBe(false);
      expect(state.position).toEqual({ x: 0, y: 0 });
      expect(state.menuType).toBeNull();
      expect(state.targetId).toBeNull();
      expect(state.targetIds).toBeNull();
    });
  });

  describe('openNodeMenu', () => {
    it('should open node menu at specified position', () => {
      const { openNodeMenu } = useContextMenuStore.getState();

      openNodeMenu('node-123', 100, 200);

      const state = useContextMenuStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.position).toEqual({ x: 100, y: 200 });
      expect(state.menuType).toBe('node');
      expect(state.targetId).toBe('node-123');
      expect(state.targetIds).toBeNull();
    });

    it('should update menu when opening different node', () => {
      const { openNodeMenu } = useContextMenuStore.getState();

      openNodeMenu('node-1', 50, 50);
      openNodeMenu('node-2', 150, 250);

      const state = useContextMenuStore.getState();
      expect(state.targetId).toBe('node-2');
      expect(state.position).toEqual({ x: 150, y: 250 });
    });
  });

  describe('openEdgeMenu', () => {
    it('should open edge menu at specified position', () => {
      const { openEdgeMenu } = useContextMenuStore.getState();

      openEdgeMenu('edge-456', 300, 400);

      const state = useContextMenuStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.position).toEqual({ x: 300, y: 400 });
      expect(state.menuType).toBe('edge');
      expect(state.targetId).toBe('edge-456');
      expect(state.targetIds).toBeNull();
    });
  });

  describe('openPaneMenu', () => {
    it('should open pane menu at specified position', () => {
      const { openPaneMenu } = useContextMenuStore.getState();

      openPaneMenu(500, 600);

      const state = useContextMenuStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.position).toEqual({ x: 500, y: 600 });
      expect(state.menuType).toBe('pane');
      expect(state.targetId).toBeNull();
      expect(state.targetIds).toBeNull();
    });
  });

  describe('openSelectionMenu', () => {
    it('should open selection menu with node IDs', () => {
      const { openSelectionMenu } = useContextMenuStore.getState();

      openSelectionMenu(['node-1', 'node-2', 'node-3'], 700, 800);

      const state = useContextMenuStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.position).toEqual({ x: 700, y: 800 });
      expect(state.menuType).toBe('selection');
      expect(state.targetId).toBeNull();
      expect(state.targetIds).toEqual(['node-1', 'node-2', 'node-3']);
    });

    it('should handle empty selection', () => {
      const { openSelectionMenu } = useContextMenuStore.getState();

      openSelectionMenu([], 100, 100);

      const state = useContextMenuStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.targetIds).toEqual([]);
    });

    it('should handle single node selection', () => {
      const { openSelectionMenu } = useContextMenuStore.getState();

      openSelectionMenu(['single-node'], 100, 100);

      const state = useContextMenuStore.getState();
      expect(state.targetIds).toEqual(['single-node']);
    });
  });

  describe('close', () => {
    it('should close menu and reset state', () => {
      const { openNodeMenu, close } = useContextMenuStore.getState();

      openNodeMenu('node-1', 100, 200);
      close();

      const state = useContextMenuStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.menuType).toBeNull();
      expect(state.targetId).toBeNull();
      expect(state.targetIds).toBeNull();
    });

    it('should preserve position after close', () => {
      const { openNodeMenu, close } = useContextMenuStore.getState();

      openNodeMenu('node-1', 100, 200);
      close();

      const state = useContextMenuStore.getState();
      // Position is not reset on close - only menu type and targets
      expect(state.position).toEqual({ x: 100, y: 200 });
    });

    it('should close selection menu', () => {
      const { openSelectionMenu, close } = useContextMenuStore.getState();

      openSelectionMenu(['node-1', 'node-2'], 300, 400);
      close();

      const state = useContextMenuStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.targetIds).toBeNull();
    });
  });

  describe('menu transitions', () => {
    it('should switch from node menu to edge menu', () => {
      const { openNodeMenu, openEdgeMenu } = useContextMenuStore.getState();

      openNodeMenu('node-1', 100, 100);
      openEdgeMenu('edge-1', 200, 200);

      const state = useContextMenuStore.getState();
      expect(state.menuType).toBe('edge');
      expect(state.targetId).toBe('edge-1');
    });

    it('should switch from pane menu to selection menu', () => {
      const { openPaneMenu, openSelectionMenu } = useContextMenuStore.getState();

      openPaneMenu(100, 100);
      openSelectionMenu(['node-1'], 200, 200);

      const state = useContextMenuStore.getState();
      expect(state.menuType).toBe('selection');
      expect(state.targetIds).toEqual(['node-1']);
    });

    it('should switch from selection menu to node menu', () => {
      const { openSelectionMenu, openNodeMenu } = useContextMenuStore.getState();

      openSelectionMenu(['node-1', 'node-2'], 100, 100);
      openNodeMenu('node-3', 300, 300);

      const state = useContextMenuStore.getState();
      expect(state.menuType).toBe('node');
      expect(state.targetId).toBe('node-3');
      expect(state.targetIds).toBeNull();
    });
  });
});
