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

// Mock workflow store
const mockAddNode = vi.fn();
const mockNodes = [
  { data: {}, id: 'node-1', position: { x: 0, y: 0 }, type: 'imageGen' },
  { data: {}, id: 'node-2', position: { x: 100, y: 0 }, type: 'llm' },
];
const mockEdges = [{ id: 'edge-1', source: 'node-1', target: 'node-2' }];

vi.mock('../stores/workflow', () => {
  const store = (selector?: (state: unknown) => unknown) => {
    const state = { addNode: mockAddNode, edges: mockEdges, nodes: mockNodes };
    return selector ? selector(state) : state;
  };
  return { useWorkflowStore: store };
});

vi.mock('../stores/workflow/selectors', () => ({
  selectAddNode: (state: { addNode: unknown }) => state.addNode,
}));

// autoLayout reads the shared edge style from the package settings store — the
// single source of truth the app now injects into rather than shadowing.
const mockEdgeStyle = { value: 'smoothstep' };
vi.mock('../stores/settingsStore', () => {
  const store = () => ({ edgeStyle: mockEdgeStyle.value });
  store.getState = () => ({ edgeStyle: mockEdgeStyle.value });
  return { useSettingsStore: store };
});

vi.mock('../lib/autoLayout', () => ({
  getLayoutedNodes: vi.fn((nodes) =>
    nodes.map(
      (n: { id: string; position: { x: number; y: number } }, i: number) => ({
        ...n,
        position: { x: i * 200, y: 0 },
      }),
    ),
  ),
}));

describe('usePaneActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockEdgeStyle.value = 'smoothstep';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('addNodeAtPosition', () => {
    it('converts screen position to flow position and adds the node', () => {
      const { result } = renderHook(() => usePaneActions());

      act(() => {
        result.current.addNodeAtPosition('imageGen', 100, 200);
      });

      expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 100, y: 200 });
      expect(mockAddNode).toHaveBeenCalledWith('imageGen', { x: 100, y: 200 });
    });
  });

  describe('selectAll', () => {
    it('marks every node selected', () => {
      const { result } = renderHook(() => usePaneActions());

      act(() => {
        result.current.selectAll();
      });

      expect(mockSetNodes).toHaveBeenCalled();
      const updater = mockSetNodes.mock.calls[0][0];
      const updated = updater(mockNodes);
      expect(updated[0].selected).toBe(true);
      expect(updated[1].selected).toBe(true);
    });
  });

  describe('fitView', () => {
    it('fits the view with padding', () => {
      const { result } = renderHook(() => usePaneActions());

      act(() => {
        result.current.fitView();
      });

      expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2 });
    });
  });

  describe('autoLayout', () => {
    it('lays out nodes and normalizes edges to the store edge style', () => {
      const { result } = renderHook(() => usePaneActions());

      act(() => {
        result.current.autoLayout();
      });

      expect(mockSetNodes).toHaveBeenCalled();
      // Edges are normalized to the edge style read from the settings store.
      const edgeUpdater = mockSetEdges.mock.calls[0][0];
      const normalized = edgeUpdater(mockEdges);
      expect(normalized[0].type).toBe('smoothstep');
    });

    it('reflects a changed store edge style on the next layout', () => {
      mockEdgeStyle.value = 'straight';
      const { result } = renderHook(() => usePaneActions());

      act(() => {
        result.current.autoLayout('TB');
      });

      const edgeUpdater = mockSetEdges.mock.calls[0][0];
      expect(edgeUpdater(mockEdges)[0].type).toBe('straight');
    });

    it('fits the view after a delay', () => {
      const { result } = renderHook(() => usePaneActions());

      act(() => {
        result.current.autoLayout();
      });

      expect(mockFitView).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(50);
      });

      expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2 });
    });
  });
});
