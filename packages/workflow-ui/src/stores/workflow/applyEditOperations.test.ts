import type { WorkflowEdge, WorkflowNode } from '@genfeedai/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureApplyEditOperations,
  getApplyEditOperations,
} from './applyEditOperations';
import type { EditOperation } from './slices/types';

const nodes = [
  { data: {}, id: 'a', position: { x: 0, y: 0 }, type: 'prompt' },
] as unknown as WorkflowNode[];
const edges = [] as WorkflowEdge[];

describe('applyEditOperations', () => {
  afterEach(() => {
    // Reset to the no-op default so tests don't leak an implementation.
    configureApplyEditOperations(undefined);
  });

  it('defaults to a no-op that leaves the graph untouched', () => {
    const operations: EditOperation[] = [{ nodeId: 'a', type: 'removeNode' }];

    const result = getApplyEditOperations()(operations, { edges, nodes });

    expect(result).toEqual({ applied: 0, edges, nodes, skipped: [] });
  });

  it('routes to the configured implementation with operations + state', () => {
    const apply = vi
      .fn()
      .mockReturnValue({ applied: 1, edges, nodes: [], skipped: [] });
    configureApplyEditOperations(apply);

    const operations: EditOperation[] = [{ nodeId: 'a', type: 'removeNode' }];
    const result = getApplyEditOperations()(operations, { edges, nodes });

    expect(apply).toHaveBeenCalledWith(operations, { edges, nodes });
    expect(result.applied).toBe(1);
  });

  it('reverts to the no-op when reconfigured with undefined', () => {
    configureApplyEditOperations(
      vi.fn().mockReturnValue({ applied: 5, edges, nodes: [], skipped: [] }),
    );
    configureApplyEditOperations(undefined);

    const result = getApplyEditOperations()([], { edges, nodes });

    expect(result.applied).toBe(0);
  });
});
