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
const mockAddNodesAndEdges = vi.fn();
const mockSetSelectedNodeIds = vi.fn();
const mockUpdateNodeData = vi.fn();
const mockSetNodes = vi.fn();
const mockScreenToFlowPosition = vi.fn((pos: { x: number; y: number }) => ({
  x: pos.x + 10,
  y: pos.y + 20,
}));
const mockAutoLayout = vi.fn();
const mockFitView = vi.fn();
const mockSelectAll = vi.fn();
const mockAddNodeAtPosition = vi.fn();
const mockCopyNode = vi.fn();
const mockCutNode = vi.fn();
const mockDeleteNode = vi.fn();
const mockDuplicate = vi.fn();
const mockDeleteMultipleNodes = vi.fn();
const mockDuplicateMultipleNodes = vi.fn();
const mockGetPasteData = vi.fn();
let mockClipboard: unknown = null;

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
      addNodesAndEdges: mockAddNodesAndEdges,
      createGroup: mockCreateGroup,
      nodes: [
        {
          data: {
            color: '#ff0000',
            locked: false,
            outputImage: 'https://cdn.example.test/thumb.jpg',
          },
          id: 'node-1',
          position: { x: 0, y: 0 },
          type: 'imageGen',
        },
        {
          data: { locked: true },
          id: 'node-2',
          position: { x: 100, y: 0 },
          type: 'llm',
        },
      ],
      removeEdge: mockRemoveEdge,
      setSelectedNodeIds: mockSetSelectedNodeIds,
      toggleNodeLock: mockToggleNodeLock,
      updateNodeData: mockUpdateNodeData,
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
    screenToFlowPosition: mockScreenToFlowPosition,
    setEdges: vi.fn(),
    setNodes: mockSetNodes,
  }),
}));

vi.mock('./useNodeActions', () => ({
  useNodeActions: () => ({
    clipboard: mockClipboard,
    copyNode: mockCopyNode,
    cutNode: mockCutNode,
    deleteMultipleNodes: mockDeleteMultipleNodes,
    deleteNode: mockDeleteNode,
    duplicate: mockDuplicate,
    duplicateMultipleNodes: mockDuplicateMultipleNodes,
    getPasteData: mockGetPasteData,
  }),
}));

vi.mock('./usePaneActions', () => ({
  usePaneActions: () => ({
    addNodeAtPosition: mockAddNodeAtPosition,
    autoLayout: mockAutoLayout,
    fitView: mockFitView,
    selectAll: mockSelectAll,
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
  getEdgeMenuItems: vi.fn(() => [
    { id: 'edge-menu-item', label: 'Edge Action' },
  ]),
  getNodeMenuItems: vi.fn(() => [
    { id: 'node-menu-item', label: 'Node Action' },
  ]),
  getPaneMenuItems: vi.fn(() => [
    { id: 'pane-menu-item', label: 'Pane Action' },
  ]),
  getSelectionMenuItems: vi.fn(() => [
    { id: 'selection-menu-item', label: 'Selection Action' },
  ]),
}));

import {
  getEdgeMenuItems,
  getNodeMenuItems,
  getPaneMenuItems,
  getSelectionMenuItems,
} from '@/components/context-menu/menus';
import { workflowsApi } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useContextMenuStore } from '@/store/contextMenuStore';

const mockedUseContextMenuStore = vi.mocked(useContextMenuStore);
const mockedGetNodeMenuItems = vi.mocked(getNodeMenuItems);
const mockedGetEdgeMenuItems = vi.mocked(getEdgeMenuItems);
const mockedGetPaneMenuItems = vi.mocked(getPaneMenuItems);
const mockedGetSelectionMenuItems = vi.mocked(getSelectionMenuItems);

describe('useContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClipboard = null;
    mockGetPasteData.mockReturnValue(null);
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

    it('should wire node menu handlers for locking, color, thumbnail, and node actions', async () => {
      vi.mocked(workflowsApi.setThumbnail).mockResolvedValueOnce({} as never);
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

      renderHook(() => useContextMenu());

      const args = mockedGetNodeMenuItems.mock.calls.at(-1)?.[0] as {
        currentColor?: string;
        hasMediaOutput: boolean;
        onCopy: (id: string) => void;
        onCut: (id: string) => void;
        onDelete: (id: string) => void;
        onDuplicate: (id: string) => void;
        onLock: (id: string) => void;
        onSetAsThumbnail?: (id: string) => Promise<void>;
        onSetColor: (id: string, color: string | null) => void;
        onUnlock: (id: string) => void;
      };

      expect(args.currentColor).toBe('#ff0000');
      expect(args.hasMediaOutput).toBe(true);

      args.onCopy('node-1');
      args.onCut('node-1');
      args.onDelete('node-1');
      args.onDuplicate('node-1');
      args.onLock('node-1');
      args.onUnlock('node-2');
      args.onSetColor('node-1', null);
      await args.onSetAsThumbnail?.('node-1');

      expect(mockCopyNode).toHaveBeenCalledWith('node-1');
      expect(mockCutNode).toHaveBeenCalledWith('node-1');
      expect(mockDeleteNode).toHaveBeenCalledWith('node-1');
      expect(mockDuplicate).toHaveBeenCalledWith('node-1');
      expect(mockToggleNodeLock).toHaveBeenCalledWith('node-1');
      expect(mockToggleNodeLock).toHaveBeenCalledWith('node-2');
      expect(mockUpdateNodeData).toHaveBeenCalledWith('node-1', {
        color: undefined,
      });
      expect(workflowsApi.setThumbnail).toHaveBeenCalledWith(
        'workflow-1',
        'https://cdn.example.test/thumb.jpg',
        'node-1',
      );
      expect(logger.info).toHaveBeenCalledWith('Thumbnail set successfully', {
        nodeId: 'node-1',
        workflowId: 'workflow-1',
      });
    });

    it('should log thumbnail failures without throwing', async () => {
      vi.mocked(workflowsApi.setThumbnail).mockRejectedValueOnce(
        new Error('thumbnail failed'),
      );
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

      renderHook(() => useContextMenu());

      const args = mockedGetNodeMenuItems.mock.calls.at(-1)?.[0] as {
        onSetAsThumbnail?: (id: string) => Promise<void>;
      };
      await args.onSetAsThumbnail?.('node-1');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to set thumbnail',
        expect.any(Error),
        { nodeId: 'node-1', workflowId: 'workflow-1' },
      );
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
      const args = mockedGetEdgeMenuItems.mock.calls.at(-1)?.[0] as {
        onDelete: (id: string) => void;
      };
      args.onDelete('edge-1');
      expect(mockRemoveEdge).toHaveBeenCalledWith('edge-1');
    });

    it('should return pane menu items when menuType is pane', () => {
      mockClipboard = { nodes: [] };
      mockGetPasteData.mockReturnValue({
        edges: [{ id: 'pasted-edge' }],
        nodes: [{ id: 'pasted-node' }],
      });
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
      const args = mockedGetPaneMenuItems.mock.calls.at(-1)?.[0] as {
        hasClipboard: boolean;
        onAddNode: (type: string, position: { x: number; y: number }) => void;
        onAutoLayout: () => void;
        onFitView: () => void;
        onPaste: () => void;
        onSelectAll: () => void;
      };
      expect(args.hasClipboard).toBe(true);
      args.onAddNode('prompt', { x: 1, y: 2 });
      args.onAutoLayout();
      args.onFitView();
      args.onSelectAll();
      args.onPaste();
      expect(mockAddNodeAtPosition).toHaveBeenCalledWith('prompt', {
        x: 1,
        y: 2,
      });
      expect(mockAutoLayout).toHaveBeenCalledWith('LR');
      expect(mockFitView).toHaveBeenCalled();
      expect(mockSelectAll).toHaveBeenCalled();
      expect(mockScreenToFlowPosition).toHaveBeenCalledWith({
        x: 200,
        y: 300,
      });
      expect(mockGetPasteData).toHaveBeenCalledWith(210, 320);
      expect(mockAddNodesAndEdges).toHaveBeenCalledWith(
        [{ id: 'pasted-node' }],
        [{ id: 'pasted-edge' }],
      );
      expect(mockSetSelectedNodeIds).toHaveBeenCalledWith(['pasted-node']);
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
      const args = mockedGetSelectionMenuItems.mock.calls.at(-1)?.[0] as {
        onAlignHorizontal: (ids: string[]) => void;
        onAlignVertical: (ids: string[]) => void;
        onDeleteAll: (ids: string[]) => void;
        onDuplicateAll: (ids: string[]) => void;
        onGroup: (ids: string[]) => void;
        onLockAll: (ids: string[]) => void;
        onUnlockAll: (ids: string[]) => void;
      };
      args.onGroup(['node-1', 'node-2']);
      args.onLockAll(['node-1', 'node-2']);
      args.onUnlockAll(['node-1', 'node-2']);
      args.onDeleteAll(['node-1', 'node-2']);
      args.onDuplicateAll(['node-1', 'node-2']);
      args.onAlignHorizontal(['node-1', 'node-2']);
      args.onAlignVertical(['node-1', 'node-2']);

      expect(mockCreateGroup).toHaveBeenCalledWith(['node-1', 'node-2']);
      expect(mockToggleNodeLock).toHaveBeenCalledWith('node-1');
      expect(mockToggleNodeLock).toHaveBeenCalledWith('node-2');
      expect(mockDeleteMultipleNodes).toHaveBeenCalledWith([
        'node-1',
        'node-2',
      ]);
      expect(mockDuplicateMultipleNodes).toHaveBeenCalledWith([
        'node-1',
        'node-2',
      ]);
      expect(mockSetNodes).toHaveBeenCalledTimes(2);
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
