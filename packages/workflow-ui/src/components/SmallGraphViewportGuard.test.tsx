import { render } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SmallGraphViewportGuard } from './SmallGraphViewportGuard';

const stores = vi.hoisted(() => ({
  fitView: vi.fn(),
  nodes: [] as Array<{ id: string }>,
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    fitView: stores.fitView,
  }),
}));

vi.mock('../stores/workflowStore', () => ({
  useWorkflowStore: (
    selector?: (state: { nodes: Array<{ id: string }> }) => unknown,
  ) => {
    const state = { nodes: stores.nodes };
    return selector ? selector(state) : state;
  },
}));

describe('SmallGraphViewportGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stores.nodes = [];

    vi.stubGlobal('requestAnimationFrame', ((
      callback: FrameRequestCallback,
    ) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame);
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn() as typeof cancelAnimationFrame,
    );
  });

  it('clamps fitView zoom when nodes are added to a tiny graph', () => {
    const { rerender } = render(<SmallGraphViewportGuard />);

    stores.nodes = [{ id: 'node-1' }];
    act(() => {
      rerender(<SmallGraphViewportGuard />);
    });

    expect(stores.fitView).toHaveBeenCalledWith({
      duration: 180,
      maxZoom: 0.9,
      minZoom: 0.35,
      padding: 0.24,
    });
  });

  it('does not refit once the graph grows beyond the small-graph threshold', () => {
    stores.nodes = [{ id: 'node-1' }, { id: 'node-2' }];
    const { rerender } = render(<SmallGraphViewportGuard />);

    stores.fitView.mockClear();
    stores.nodes = [{ id: 'node-1' }, { id: 'node-2' }, { id: 'node-3' }];

    act(() => {
      rerender(<SmallGraphViewportGuard />);
    });

    expect(stores.fitView).not.toHaveBeenCalled();
  });
});
