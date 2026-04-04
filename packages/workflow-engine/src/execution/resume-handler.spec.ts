import {
  analyzeForResume,
  createCacheFromRun,
  mergeExecutionResults,
} from '@workflow-engine/execution/resume-handler';
import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutionRun,
} from '@workflow-engine/types';
import { describe, expect, it } from 'vitest';

const nodes: ExecutableNode[] = [
  { config: {}, id: 'a', inputs: [], label: 'A', type: 'text' },
  { config: {}, id: 'b', inputs: ['a'], label: 'B', type: 'text' },
  { config: {}, id: 'c', inputs: ['b'], label: 'C', type: 'text' },
];

const edges: ExecutableEdge[] = [
  { id: 'e1', source: 'a', target: 'b' },
  { id: 'e2', source: 'b', target: 'c' },
];

function makeRun(overrides: Partial<ExecutionRun>): ExecutionRun {
  return {
    creditsUsed: 0,
    executedNodeIds: ['a', 'b'],
    failedNodeId: 'b',
    nodeResults: [
      {
        completedAt: new Date(),
        creditsUsed: 0,
        nodeId: 'a',
        output: 'output-a',
        retryCount: 0,
        startedAt: new Date(),
        status: 'completed',
      },
      {
        completedAt: new Date(),
        creditsUsed: 0,
        error: 'some error',
        nodeId: 'b',
        retryCount: 0,
        startedAt: new Date(),
        status: 'failed',
      },
    ],
    runId: 'run-1',
    startedAt: new Date(),
    status: 'failed',
    ...overrides,
  };
}

describe('analyzeForResume', () => {
  it('can resume from failed run', () => {
    const analysis = analyzeForResume(makeRun({}), nodes, edges);
    expect(analysis.canResume).toBe(true);
    expect(analysis.resumeFromNodeId).toBe('b');
    expect(analysis.nodesToReExecute).toContain('b');
    expect(analysis.nodesToReExecute).toContain('c');
    expect(analysis.completedNodeIds).toEqual(['a']);
  });

  it('cannot resume completed run', () => {
    const analysis = analyzeForResume(
      makeRun({ status: 'completed' }),
      nodes,
      edges,
    );
    expect(analysis.canResume).toBe(false);
    expect(analysis.reason).toContain('completed');
  });

  it('cannot resume without failedNodeId', () => {
    const analysis = analyzeForResume(
      makeRun({ failedNodeId: undefined }),
      nodes,
      edges,
    );
    expect(analysis.canResume).toBe(false);
    expect(analysis.reason).toContain('no failed node');
  });

  it('cannot resume when failed node removed from workflow', () => {
    const analysis = analyzeForResume(
      makeRun({ failedNodeId: 'x' }),
      nodes,
      edges,
    );
    expect(analysis.canResume).toBe(false);
    expect(analysis.reason).toContain('no longer exists');
  });
});

describe('createCacheFromRun', () => {
  it('creates cache from completed results', () => {
    const cache = createCacheFromRun(makeRun({}));
    expect(cache.get('a')).toBe('output-a');
    expect(cache.has('b')).toBe(false);
  });
});

describe('mergeExecutionResults', () => {
  it('merges previous and current results', () => {
    const current = [
      {
        completedAt: new Date(),
        creditsUsed: 1,
        nodeId: 'b',
        output: 'output-b',
        retryCount: 1,
        startedAt: new Date(),
        status: 'completed' as const,
      },
    ];
    const merged = mergeExecutionResults(makeRun({}), current);
    expect(merged.length).toBe(2);
    const bResult = merged.find((r) => r.nodeId === 'b');
    expect(bResult?.status).toBe('completed');
    expect(bResult?.output).toBe('output-b');
  });
});
