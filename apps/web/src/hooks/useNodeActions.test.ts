import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNodeActions } from './useNodeActions';

// Mock workflowStore
const mockRemoveNode = vi.fn();
const mockDuplicateNode = vi.fn();

vi.mock('@/store/workflowStore', () => {
  const store = (selector?: (state: unknown) => unknown) => {
    const state = {
      duplicateNode: mockDuplicateNode,
      nodes: [
        { data: {}, id: 'node-1', position: { x: 0, y: 0 }, type: 'imageGen' },
        { data: {}, id: 'node-2', position: { x: 100, y: 0 }, type: 'llm' },
        { data: {}, id: 'node-3', position: { x: 200, y: 0 }, type: 'output' },
      ],
      removeNode: mockRemoveNode,
    };
    return selector ? selector(state) : state;
  };
  return { useWorkflowStore: store };
});

describe('useNodeActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDuplicateNode.mockReturnValue('new-node-id');
  });

  describe('deleteNode', () => {
    it('should call removeNode with nodeId', () => {
      const { result } = renderHook(() => useNodeActions());

      act(() => {
        result.current.deleteNode('node-1');
      });

      expect(mockRemoveNode).toHaveBeenCalledWith('node-1');
    });

    it('should call removeNode for each delete call', () => {
      const { result } = renderHook(() => useNodeActions());

      act(() => {
        result.current.deleteNode('node-1');
        result.current.deleteNode('node-2');
      });

      expect(mockRemoveNode).toHaveBeenCalledTimes(2);
    });
  });

  describe('duplicate', () => {
    it('should call duplicateNode and return new id', () => {
      const { result } = renderHook(() => useNodeActions());

      let newId: string | null | undefined;
      act(() => {
        newId = result.current.duplicate('node-1');
      });

      expect(mockDuplicateNode).toHaveBeenCalledWith('node-1');
      expect(newId).toBe('new-node-id');
    });
  });

  describe('copyNode', () => {
    it('should add node to clipboard', () => {
      const { result } = renderHook(() => useNodeActions());

      act(() => {
        result.current.copyNode('node-1');
      });

      expect(result.current.clipboard).not.toBeNull();
      expect(result.current.clipboard?.nodes).toHaveLength(1);
      expect(result.current.clipboard?.nodes[0].id).toBe('node-1');
      expect(result.current.clipboard?.isCut).toBe(false);
    });

    it('should not modify clipboard for non-existent node', () => {
      const { result } = renderHook(() => useNodeActions());

      act(() => {
        result.current.copyNode('non-existent');
      });

      expect(result.current.clipboard).toBeNull();
    });
  });

  describe('cutNode', () => {
    it('should add node to clipboard with isCut true and remove node', () => {
      const { result } = renderHook(() => useNodeActions());

      act(() => {
        result.current.cutNode('node-1');
      });

      expect(result.current.clipboard?.isCut).toBe(true);
      expect(result.current.clipboard?.nodes[0].id).toBe('node-1');
      expect(mockRemoveNode).toHaveBeenCalledWith('node-1');
    });
  });

  describe('deleteMultipleNodes', () => {
    it('should call removeNode for each node ID', () => {
      const { result } = renderHook(() => useNodeActions());

      act(() => {
        result.current.deleteMultipleNodes(['node-1', 'node-2', 'node-3']);
      });

      expect(mockRemoveNode).toHaveBeenCalledTimes(3);
      expect(mockRemoveNode).toHaveBeenCalledWith('node-1');
      expect(mockRemoveNode).toHaveBeenCalledWith('node-2');
      expect(mockRemoveNode).toHaveBeenCalledWith('node-3');
    });

    it('should handle empty array', () => {
      const { result } = renderHook(() => useNodeActions());

      act(() => {
        result.current.deleteMultipleNodes([]);
      });

      expect(mockRemoveNode).not.toHaveBeenCalled();
    });
  });

  describe('duplicateMultipleNodes', () => {
    it('should call duplicateNode for each node ID', () => {
      const { result } = renderHook(() => useNodeActions());

      let newIds: string[] = [];
      act(() => {
        newIds = result.current.duplicateMultipleNodes(['node-1', 'node-2']);
      });

      expect(mockDuplicateNode).toHaveBeenCalledTimes(2);
      expect(newIds).toHaveLength(2);
    });

    it('should not include null results', () => {
      mockDuplicateNode.mockReturnValueOnce('new-id-1').mockReturnValueOnce(null);

      const { result } = renderHook(() => useNodeActions());

      let newIds: string[] = [];
      act(() => {
        newIds = result.current.duplicateMultipleNodes(['node-1', 'node-2']);
      });

      expect(newIds).toHaveLength(1);
      expect(newIds[0]).toBe('new-id-1');
    });
  });

  describe('clipboard state', () => {
    it('should start with null clipboard', () => {
      const { result } = renderHook(() => useNodeActions());

      expect(result.current.clipboard).toBeNull();
    });

    it('should update clipboard when copying different nodes', () => {
      const { result } = renderHook(() => useNodeActions());

      act(() => {
        result.current.copyNode('node-1');
      });

      expect(result.current.clipboard?.nodes[0].id).toBe('node-1');

      act(() => {
        result.current.copyNode('node-2');
      });

      expect(result.current.clipboard?.nodes[0].id).toBe('node-2');
    });
  });
});
