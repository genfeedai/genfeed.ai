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
        new Map(),
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

      expect(
        service.isNodeReachable('join', edges, completed, skipped, new Map()),
      ).toBe(true);
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

  it.each(['prepare', 'infer', 'finalize'])(
    'preserves the shared failure handler when %s fails',
    (failedNode) => {
      const sources = ['prepare', 'infer', 'finalize'];
      const edges: ExecutableEdge[] = [
        { id: 'prepare-infer', source: 'prepare', target: 'infer' },
        { id: 'infer-finalize', source: 'infer', target: 'finalize' },
        ...sources.map((source) => ({
          id: `${source}-failure`,
          source,
          sourceHandle: 'failure',
          target: 'fail-turn',
          targetHandle: 'failure',
        })),
      ];
      const completed = new Set(
        sources.slice(0, sources.indexOf(failedNode) + 1),
      );
      const skipped = new Set<string>();
      service.pruneSuccessPathsAfterFailure(
        failedNode,
        edges,
        skipped,
        completed,
      );
      expect(skipped).toEqual(
        new Set(sources.slice(sources.indexOf(failedNode) + 1)),
      );
      expect(
        service.isNodeReachable(
          'fail-turn',
          edges,
          completed,
          skipped,
          new Map([[failedNode, { status: 'failed' }]]),
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
