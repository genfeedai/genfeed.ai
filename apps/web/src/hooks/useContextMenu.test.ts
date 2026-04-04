import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextMenu } from './useContextMenu';

// Mock stores
const mockOpenNodeMenu = vi.fn();
const mockOpenEdgeMenu = vi.fn();
const mockOpenPaneMenu = vi.fn();
const mockOpenSelectionMenu = vi.fn();
const mockClose = vi.fn();
const mockRemoveEdge = vi.fn();
const mockToggleNodeLock = vi.fn();
const mockCreateGroup = vi.fn();

vi.mock('@/store/contextMenuStore', () => ({
  useContextMenuStore: vi.fn(() => ({
    close: mockClose,
    isOpen: false,
    menuType: null,
    openEdgeMenu: mockOpenEdgeMenu,
    openNodeMenu: mockOpenNodeMenu,
    openPaneMenu: mockOpenPaneMenu,
    openSelectionMenu: mockOpenSelectionMenu,
    position: { x: 100, y: 100 },
    targetId: null,
    targetIds: null,
  })),
}));

vi.mock('@/store/workflowStore', () => {
  const store = (selector?: (state: unknown) => unknown) => {
    const state = {
      addNodesAndEdges: vi.fn(),
      createGroup: mockCreateGroup,
      nodes: [
        { data: { locked: false }, id: 'node-1', position: { x: 0, y: 0 }, type: 'imageGen' },
        { data: { locked: true }, id: 'node-2', position: { x: 100, y: 0 }, type: 'llm' },
      ],
      removeEdge: mockRemoveEdge,
      setSelectedNodeIds: vi.fn(),
      toggleNodeLock: mockToggleNodeLock,
      updateNodeData: vi.fn(),
      workflowId: 'workflow-1',
    };
    return selector ? selector(state) : state;
  };
  return { useWorkflowStore: store };
});

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    fitView: vi.fn(),
    getEdges: vi.fn(() => []),
    getNodes: vi.fn(() => []),
    screenToFlowPosition: vi.fn((pos: { x: number; y: number }) => pos),
    setEdges: vi.fn(),
    setNodes: vi.fn(),
  }),
}));

vi.mock('./useNodeActions', () => ({
  useNodeActions: () => ({
    clipboard: null,
    copyNode: vi.fn(),
    cutNode: vi.fn(),
    deleteMultipleNodes: vi.fn(),
    deleteNode: vi.fn(),
    duplicate: vi.fn(),
    duplicateMultipleNodes: vi.fn(),
    getPasteData: vi.fn(() => null),
  }),
}));

vi.mock('./usePaneActions', () => ({
  usePaneActions: () => ({
    addNodeAtPosition: vi.fn(),
    autoLayout: vi.fn(),
    fitView: vi.fn(),
    selectAll: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  workflowsApi: {
    setThumbnail: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/components/context-menu/menus', () => ({
  getEdgeMenuItems: vi.fn(() => [{ id: 'edge-menu-item', label: 'Edge Action' }]),
  getNodeMenuItems: vi.fn(() => [{ id: 'node-menu-item', label: 'Node Action' }]),
  getPaneMenuItems: vi.fn(() => [{ id: 'pane-menu-item', label: 'Pane Action' }]),
  getSelectionMenuItems: vi.fn(() => [{ id: 'selection-menu-item', label: 'Selection Action' }]),
}));

import {
  getEdgeMenuItems,
  getNodeMenuItems,
  getPaneMenuItems,
  getSelectionMenuItems,
} from '@/components/context-menu/menus';
import { useContextMenuStore } from '@/store/contextMenuStore';
const mockedUseContextMenuStore = vi.mocked(useContextMenuStore);
const mockedGetNodeMenuItems = vi.mocked(getNodeMenuItems);
const mockedGetEdgeMenuItems = vi.mocked(getEdgeMenuItems);
const mockedGetPaneMenuItems = vi.mocked(getPaneMenuItems);
const mockedGetSelectionMenuItems = vi.mocked(getSelectionMenuItems);

describe('useContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return correct initial values', () => {
      const { result } = renderHook(() => useContextMenu());

      expect(result.current.isOpen).toBe(false);
      expect(result.current.position).toEqual({ x: 100, y: 100 });
      expect(result.current.menuType).toBeNull();
    });

    it('should return menu functions', () => {
      const { result } = renderHook(() => useContextMenu());

      expect(result.current.openNodeMenu).toBe(mockOpenNodeMenu);
      expect(result.current.openEdgeMenu).toBe(mockOpenEdgeMenu);
      expect(result.current.openPaneMenu).toBe(mockOpenPaneMenu);
      expect(result.current.openSelectionMenu).toBe(mockOpenSelectionMenu);
      expect(result.current.close).toBe(mockClose);
    });
  });

  describe('menuItems', () => {
    it('should return empty array when menuType is null', () => {
      const { result } = renderHook(() => useContextMenu());

      expect(result.current.menuItems).toEqual([]);
    });

    it('should return node menu items when menuType is node', () => {
      mockedUseContextMenuStore.mockReturnValue({
        close: mockClose,
        isOpen: true,
        menuType: 'node',
        openEdgeMenu: mockOpenEdgeMenu,
        openNodeMenu: mockOpenNodeMenu,
        openPaneMenu: mockOpenPaneMenu,
        openSelectionMenu: mockOpenSelectionMenu,
        position: { x: 100, y: 100 },
        targetId: 'node-1',
        targetIds: null,
      });

      const { result } = renderHook(() => useContextMenu());

      expect(mockedGetNodeMenuItems).toHaveBeenCalled();
      expect(result.current.menuItems).toHaveLength(1);
      expect(result.current.menuItems[0].id).toBe('node-menu-item');
    });

    it('should return edge menu items when menuType is edge', () => {
      mockedUseContextMenuStore.mockReturnValue({
        close: mockClose,
        isOpen: true,
        menuType: 'edge',
        openEdgeMenu: mockOpenEdgeMenu,
        openNodeMenu: mockOpenNodeMenu,
        openPaneMenu: mockOpenPaneMenu,
        openSelectionMenu: mockOpenSelectionMenu,
        position: { x: 100, y: 100 },
        targetId: 'edge-1',
        targetIds: null,
      });

      const { result } = renderHook(() => useContextMenu());

      expect(mockedGetEdgeMenuItems).toHaveBeenCalled();
      expect(result.current.menuItems[0].id).toBe('edge-menu-item');
    });

    it('should return pane menu items when menuType is pane', () => {
      mockedUseContextMenuStore.mockReturnValue({
        close: mockClose,
        isOpen: true,
        menuType: 'pane',
        openEdgeMenu: mockOpenEdgeMenu,
        openNodeMenu: mockOpenNodeMenu,
        openPaneMenu: mockOpenPaneMenu,
        openSelectionMenu: mockOpenSelectionMenu,
        position: { x: 200, y: 300 },
        targetId: null,
        targetIds: null,
      });

      const { result } = renderHook(() => useContextMenu());

      expect(mockedGetPaneMenuItems).toHaveBeenCalled();
      expect(result.current.menuItems[0].id).toBe('pane-menu-item');
    });

    it('should return selection menu items when menuType is selection', () => {
      mockedUseContextMenuStore.mockReturnValue({
        close: mockClose,
        isOpen: true,
        menuType: 'selection',
        openEdgeMenu: mockOpenEdgeMenu,
        openNodeMenu: mockOpenNodeMenu,
        openPaneMenu: mockOpenPaneMenu,
        openSelectionMenu: mockOpenSelectionMenu,
        position: { x: 100, y: 100 },
        targetId: null,
        targetIds: ['node-1', 'node-2'],
      });

      const { result } = renderHook(() => useContextMenu());

      expect(mockedGetSelectionMenuItems).toHaveBeenCalled();
      expect(result.current.menuItems[0].id).toBe('selection-menu-item');
    });

    it('should return empty array for node menu without targetId', () => {
      mockedUseContextMenuStore.mockReturnValue({
        close: mockClose,
        isOpen: true,
        menuType: 'node',
        openEdgeMenu: mockOpenEdgeMenu,
        openNodeMenu: mockOpenNodeMenu,
        openPaneMenu: mockOpenPaneMenu,
        openSelectionMenu: mockOpenSelectionMenu,
        position: { x: 100, y: 100 },
        targetId: null,
        targetIds: null,
      });

      const { result } = renderHook(() => useContextMenu());

      expect(result.current.menuItems).toEqual([]);
    });

    it('should return empty array for selection menu without targetIds', () => {
      mockedUseContextMenuStore.mockReturnValue({
        close: mockClose,
        isOpen: true,
        menuType: 'selection',
        openEdgeMenu: mockOpenEdgeMenu,
        openNodeMenu: mockOpenNodeMenu,
        openPaneMenu: mockOpenPaneMenu,
        openSelectionMenu: mockOpenSelectionMenu,
        position: { x: 100, y: 100 },
        targetId: null,
        targetIds: [],
      });

      const { result } = renderHook(() => useContextMenu());

      expect(result.current.menuItems).toEqual([]);
    });
  });
});
