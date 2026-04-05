import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePaneActions } from './usePaneActions';

// Mock ReactFlow
const mockSetNodes = vi.fn();
const mockSetEdges = vi.fn();
const mockFitView = vi.fn();
const mockScreenToFlowPosition = vi.fn((pos: { x: number; y: number }) => pos);
const mockGetNodes = vi.fn(() => mockNodes);
const mockGetEdges = vi.fn(() => mockEdges);

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    fitView: mockFitView,
    getEdges: mockGetEdges,
    getNodes: mockGetNodes,
    screenToFlowPosition: mockScreenToFlowPosition,
    setEdges: mockSetEdges,
    setNodes: mockSetNodes,
  }),
}));

// Mock workflowStore
const mockAddNode = vi.fn();
const mockNodes = [
  { data: {}, id: 'node-1', position: { x: 0, y: 0 }, type: 'imageGen' },
  { data: {}, id: 'node-2', position: { x: 100, y: 0 }, type: 'llm' },
];
const mockEdges = [{ id: 'edge-1', source: 'node-1', target: 'node-2' }];

vi.mock('@/store/workflowStore', () => {
  const store = (selector?: (state: unknown) => unknown) => {
    const state = {
      addNode: mockAddNode,
      edges: mockEdges,
      nodes: mockNodes,
    };
    return selector ? selector(state) : state;
  };
  return { useWorkflowStore: store };
});

// Mock settingsStore
vi.mock('@/store/settingsStore', () => {
  const store = () => ({ edgeStyle: 'default' });
  store.getState = () => ({ edgeStyle: 'default' });
  return { useSettingsStore: store };
});

// Mock autoLayout
vi.mock('@/lib/autoLayout', () => ({
  getLayoutedNodes: vi.fn((nodes) =>
    nodes.map((n: { id: string; position: { x: number; y: number } }, i: number) => ({
      ...n,
      position: { x: i * 200, y: 0 },
    }))
  ),
}));

describe('usePaneActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('addNodeAtPosition', () => {
    it('should convert screen position to flow position and add node', () => {
      const { result } = renderHook(() => usePaneActions());

      act(() => {
        result.current.addNodeAtPosition('imageGen', 100, 200);
      });

      expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 100, y: 200 });
      expect(mockAddNode).toHaveBeenCalledWith('imageGen', { x: 100, y: 200 });
    });

    it('should handle different node types', () => {
      const { result } = renderHook(() => usePaneActions());

      act(() => {
        result.current.addNodeAtPosition('llm', 50, 50);
      });

      expect(mockAddNode).toHaveBeenCalledWith('llm', { x: 50, y: 50 });
    });
  });

  describe('selectAll', () => {
    it('should select all nodes', () => {
      const { result } = renderHook(() => usePaneActions());

      act(() => {
        result.current.selectAll();
      });

      expect(mockSetNodes).toHaveBeenCalled();
      // Get the callback passed to setNodes
      const setNodesCallback = mockSetNodes.mock.calls[0][0];
      const updatedNodes = setNodesCallback(mockNodes);

      expect(updatedNodes[0].selected).toBe(true);
      expect(updatedNodes[1].selected).toBe(true);
    });

    it('should handle empty nodes array', () => {
      const { result } = renderHook(() => usePaneActions());

      act(() => {
        result.current.selectAll();
      });

      expect(mockSetNodes).toHaveBeenCalled();
      // Verify the callback works with an empty array
      const setNodesCallback = mockSetNodes.mock.calls[0][0];
      const updatedNodes = setNodesCallback([]);

      expect(updatedNodes).toEqual([]);
    });
  });

  describe('fitView', () => {
    it('should call reactFlow.fitView with padding', () => {
      const { result } = renderHook(() => usePaneActions());

      act(() => {
        result.current.fitView();
      });

      expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2 });
    });
  });

  describe('autoLayout', () => {
    it('should layout nodes with default LR direction', async () => {
      const { result } = renderHook(() => usePaneActions());

      await act(async () => {
        result.current.autoLayout();
      });

      expect(mockSetNodes).toHaveBeenCalled();
    });

    it('should layout nodes with TB direction', async () => {
      const { result } = renderHook(() => usePaneActions());

      await act(async () => {
        result.current.autoLayout('TB');
      });

      expect(mockSetNodes).toHaveBeenCalled();
    });

    it('should call fitView after layout with delay', async () => {
      const { result } = renderHook(() => usePaneActions());

      await act(async () => {
        result.current.autoLayout();
      });

      expect(mockFitView).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(50);
      });

      expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2 });
    });
  });
});
