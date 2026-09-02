import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import type {
  ExecutableEdge,
  ExecutableNode,
} from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';

describe('WorkflowExecutionGraphService', () => {
  const service = new WorkflowExecutionGraphService();
  const target: ExecutableNode = {
    config: {},
    id: 'target',
    inputs: [],
    label: 'Target',
    type: 'genfeedAction',
  };

  it('routes a source handle into a differently named target handle', () => {
    const edges: ExecutableEdge[] = [
      {
        id: 'plan-to-items',
        source: 'plan',
        sourceHandle: 'hookItems',
        target: target.id,
        targetHandle: 'items',
      },
    ];

    expect(
      service.gatherInputs(
        target,
        edges,
        new Map([['plan', { hookItems: [{ index: 0 }], remainingItems: [] }]]),
      ),
    ).toEqual(new Map([['items', [{ index: 0 }]]]));
  });

  it('does not route an inactive explicit source handle', () => {
    const edges: ExecutableEdge[] = [
      {
        id: 'work-failure-to-compensation',
        source: 'work',
        sourceHandle: 'failure',
        target: target.id,
        targetHandle: 'failure',
      },
    ];

    expect(
      service.gatherInputs(
        target,
        edges,
        new Map([['work', { result: 'completed' }]]),
      ),
    ).toEqual(new Map());
  });

  it.each([
    ['true', 'false'],
    ['false', 'true'],
  ])(
    'treats the skipped %s branch as resolved at a reachable join',
    (completedBranch, skippedBranch) => {
      const edges: ExecutableEdge[] = [
        {
          id: 'true-to-join',
          source: 'true',
          target: 'join',
          targetHandle: 'approved',
        },
        {
          id: 'false-to-join',
          source: 'false',
          target: 'join',
          targetHandle: 'approved',
        },
      ];
      const completed = new Set([completedBranch]);
      const skipped = new Set([skippedBranch]);

      expect(service.isNodeReachable('join', edges, completed, skipped)).toBe(
        true,
      );
      expect(
        service.areDependenciesSatisfied(
          'join',
          edges,
          completed,
          new Map([[completedBranch, { approved: true }]]),
          skipped,
        ),
      ).toBe(true);
    },
  );

  it('selects failure and success edges exclusively', () => {
    const edges: ExecutableEdge[] = [
      {
        id: 'work-to-success',
        source: 'work',
        target: 'success',
      },
      {
        id: 'work-to-compensation',
        source: 'work',
        sourceHandle: 'failure',
        target: 'compensation',
        targetHandle: 'failure',
      },
    ];
    const completed = new Set(['work']);
    const successSkipped = new Set<string>();
    service.pruneFailurePathAfterSuccess(
      'work',
      edges,
      successSkipped,
      completed,
    );
    expect(successSkipped).toEqual(new Set(['compensation']));

    const failureSkipped = new Set<string>();
    service.pruneSuccessPathsAfterFailure(
      'work',
      edges,
      failureSkipped,
      completed,
    );
    expect(failureSkipped).toEqual(new Set(['success']));
  });

  it('preserves one finalizer targeted by both success and failure edges', () => {
    const edges: ExecutableEdge[] = [
      {
        id: 'work-success-to-finalizer',
        source: 'work',
        target: 'finalizer',
      },
      {
        id: 'work-failure-to-finalizer',
        source: 'work',
        sourceHandle: 'failure',
        target: 'finalizer',
        targetHandle: 'failure',
      },
    ];
    const completed = new Set(['work']);
    const successSkipped = new Set<string>();
    service.pruneFailurePathAfterSuccess(
      'work',
      edges,
      successSkipped,
      completed,
    );
    expect(successSkipped).toEqual(new Set());

    const failureSkipped = new Set<string>();
    service.pruneSuccessPathsAfterFailure(
      'work',
      edges,
      failureSkipped,
      completed,
    );
    expect(failureSkipped).toEqual(new Set());
  });
});
