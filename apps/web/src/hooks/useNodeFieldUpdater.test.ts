import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowNodeData } from '@genfeedai/types';
import { useNodeFieldUpdater } from './useNodeFieldUpdater';

const mockUpdateNodeData = vi.fn();

vi.mock('@/store/workflowStore', () => {
  const store = (selector?: (state: unknown) => unknown) => {
    const state = { updateNodeData: mockUpdateNodeData };
    return selector ? selector(state) : state;
  };
  return { useWorkflowStore: store };
});

type TestNodeData = WorkflowNodeData & {
  model: string;
  scale: number;
};

describe('useNodeFieldUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a factory function', () => {
    const { result } = renderHook(() => useNodeFieldUpdater<TestNodeData>('node-1'));

    expect(typeof result.current).toBe('function');
  });

  it('calls updateNodeData with correct field and raw value when no transform', () => {
    const { result } = renderHook(() => useNodeFieldUpdater<TestNodeData>('node-1'));

    const handler = result.current('model');
    handler('flux-pro');

    expect(mockUpdateNodeData).toHaveBeenCalledWith('node-1', {
      model: 'flux-pro',
    });
  });

  it('calls updateNodeData with transform applied', () => {
    const { result } = renderHook(() => useNodeFieldUpdater<TestNodeData>('node-1'));

    const handler = result.current('scale', (v) => Number(v));
    handler('4');

    expect(mockUpdateNodeData).toHaveBeenCalledWith('node-1', {
      scale: 4,
    });
  });

  it('uses the nodeId passed to the hook', () => {
    const { result } = renderHook(() => useNodeFieldUpdater<TestNodeData>('node-42'));

    const handler = result.current('model');
    handler('sd-xl');

    expect(mockUpdateNodeData).toHaveBeenCalledWith('node-42', {
      model: 'sd-xl',
    });
  });

  it('returns a stable factory reference when nodeId does not change', () => {
    const { result, rerender } = renderHook(() => useNodeFieldUpdater<TestNodeData>('node-1'));

    const first = result.current;
    rerender();
    const second = result.current;

    expect(first).toBe(second);
  });
});
